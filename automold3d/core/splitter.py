"""Mold modes A (one-part open) and B (two-part with pins)."""

from __future__ import annotations

import dataclasses
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import trimesh

from automold3d.core import geometry_checks as qa
from automold3d.core.alignment import PinLayout, pin_solid, plan_pins
from automold3d.core.boolean_engine import (
    difference,
    from_manifold,
    intersection,
    overlap_volume,
    split_by_plane,
    to_manifold,
    union,
)
from automold3d.core.demold_analysis import (
    CellReport,
    UndercutReport,
    analyze_n_part,
    analyze_open_mold,
    analyze_two_part,
    blocked_faces,
)
from automold3d.core.errors import GeometryError
from automold3d.core.frames import align_to_z, transformed, unit
from automold3d.core.mesh_validation import count_components
from automold3d.core.mold_body import body_for_model
from automold3d.core.mold_generator import MoldResult, cavity_model, require_solid
from automold3d.core.params import MoldParams, PartingPlane, PinParams

log = logging.getLogger(__name__)


@dataclass
class MoldPart:
    part_id: int
    name: str
    mesh: trimesh.Trimesh


@dataclass
class SplitResult:
    """Finished mold parts plus the analysis used to create them."""

    mode: str
    parts: list[MoldPart]
    model: trimesh.Trimesh
    cavity_model: trimesh.Trimesh
    undercut: UndercutReport
    checks: list[qa.CheckResult] = field(default_factory=list)
    planes: list[PartingPlane] = field(default_factory=list)
    pins: PinLayout | None = None
    warnings: list[str] = field(default_factory=list)
    # Filled by pouring.apply_channels (Channel / AirTrapSuggestion objects).
    channels: list[Any] = field(default_factory=list)
    air_traps: list[Any] = field(default_factory=list)
    # Mode C only.
    part_info: list[Any] = field(default_factory=list)
    assembly_order: list[int] = field(default_factory=list)


# ---------------------------------------------------------------- Mode A


def one_part_open(
    model: trimesh.Trimesh,
    params: MoldParams,
    pull_dir: tuple[float, float, float] = (0.0, 0.0, 1.0),
    opening_offset: float | None = None,
) -> SplitResult:
    """Open mold: body top is the opening plane pull_dir·x = opening_offset (default: model
    top). The casting is pulled out along pull_dir; anything above the plane stays open."""
    require_solid(model)
    cavity = cavity_model(model, params)
    direction = unit(pull_dir)
    rotation = align_to_z(direction)
    cavity_r = transformed(cavity, rotation)
    lo_z, hi_z = float(cavity_r.bounds[0][2]), float(cavity_r.bounds[1][2])
    top = hi_z if opening_offset is None else float(opening_offset)
    if not lo_z < top <= hi_z + 1e-9:
        raise GeometryError(
            "Açıklık düzlemi modelin içinden geçmeli (modelin en alt ve en üst noktası arasında).",
            f"opening {top} outside model range [{lo_z}, {hi_z}]",
        )
    spec = body_for_model(cavity_r, params)
    spec = dataclasses.replace(spec, hi=(spec.hi[0], spec.hi[1], top))
    body_r = spec.to_mesh()
    mold_r = difference(body_r, cavity_r).unwrap()
    inverse = np.linalg.inv(rotation)
    mold = transformed(mold_r, inverse)

    undercut = analyze_open_mold(cavity, tuple(direction), top)
    result = SplitResult("A", [MoldPart(1, "kalip_parca_1", mold)], model, cavity, undercut)
    inside_volume = float(intersection(cavity_r, body_r).unwrap().volume)
    result.checks = [
        qa.check_not_empty(mold, "Kalıp"),
        qa.check_watertight(mold, "Kalıp"),
        qa.check_volume_computable(mold, "Kalıp"),
        qa.check_volume_balance(float(body_r.volume), inside_volume, float(mold.volume)),
        _check_single_piece(mold),
        _open_wall_check(cavity_r, spec, top, params.min_wall_thickness),
        check_undercuts(undercut),
    ]
    return result


def _open_wall_check(
    cavity_r: trimesh.Trimesh, spec: object, top: float, min_wall: float
) -> qa.CheckResult:
    vertices = np.asarray(cavity_r.vertices)
    below = vertices[vertices[:, 2] <= top]
    distances = spec.inside_distance(below, open_top=True)  # type: ignore[attr-defined]
    minimum = float(distances.min())
    name = "Minimum duvar kalınlığı"
    data = {"minimum": minimum, "limit": min_wall}
    if minimum < min_wall:
        return qa.CheckResult(
            name,
            qa.CheckStatus.WARNING,
            f"En ince duvar {minimum:.2f} mm < sınır {min_wall:.2f} mm.",
            data,
        )
    return qa.CheckResult(
        name,
        qa.CheckStatus.PASSED,
        f"En ince duvar {minimum:.2f} mm (sınır {min_wall:.2f} mm).",
        data,
    )


# ---------------------------------------------------------------- Mode B


def two_part(
    mold: MoldResult,
    plane: PartingPlane,
    params: MoldParams,
    pin_params: PinParams | None = None,
    pin_positions: Sequence[tuple[float, float]] | None = None,
) -> SplitResult:
    """Split a closed mold into two halves; pins on part 1 (negative side), sockets on part 2."""
    n = np.asarray(plane.unit_normal())
    heights = np.asarray(mold.cavity_model.vertices) @ n
    if not heights.min() < plane.offset < heights.max():
        raise GeometryError(
            "Ayırma düzlemi modeli kesmiyor; boşluk tek parçada kapalı kalır ve açılamaz.",
            f"plane {plane} outside model range [{heights.min()}, {heights.max()}]",
        )
    positive, negative = split_by_plane(mold.mold, n, plane.offset)
    if positive is None or negative is None:
        raise GeometryError("Kalıp bu düzlemle ikiye bölünemedi.", f"empty half for {plane}")

    undercut = analyze_two_part(mold.cavity_model, plane)
    raw_volume = float(positive.volume + negative.volume)
    layout = None
    if pin_params is not None and (pin_params.count > 0 or pin_positions):
        layout = plan_pins(
            plane,
            mold.cavity_model,
            mold.body,
            pin_params,
            params.min_wall_thickness,
            pin_positions,
        )
        negative, positive = apply_pins(negative, positive, layout)

    parts = [MoldPart(1, "kalip_parca_1", negative), MoldPart(2, "kalip_parca_2", positive)]
    result = SplitResult(
        "B", parts, mold.model, mold.cavity_model, undercut, planes=[plane], pins=layout
    )
    result.checks = two_part_checks(result, mold, raw_volume)
    return result


def apply_pins(
    pin_part: trimesh.Trimesh, socket_part: trimesh.Trimesh, layout: PinLayout
) -> tuple[trimesh.Trimesh, trimesh.Trimesh]:
    for pin in layout.pins:
        pin_part = union(pin_part, pin).unwrap()
    for socket in layout.sockets:
        socket_part = difference(socket_part, socket).unwrap()
    return pin_part, socket_part


def two_part_checks(
    result: SplitResult, mold: MoldResult, raw_volume: float
) -> list[qa.CheckResult]:
    meshes = [p.mesh for p in result.parts]
    checks = [qa.check_part_count(meshes, 2)]
    for part in result.parts:
        checks.append(qa.check_watertight(part.mesh, part.name))
        checks.append(_check_single_piece(part.mesh, part.name))
    checks.append(check_reunion(raw_volume, float(mold.mold.volume)))
    checks.append(check_boundaries(result.parts, result.planes[0], result.pins))
    if result.pins is not None:
        checks.append(check_pins(result.pins, result.parts[1].mesh))
    checks.append(check_undercuts(result.undercut))
    return checks


def check_reunion(parts_volume: float, mold_volume: float) -> qa.CheckResult:
    name = "Parçalar birleşince kalıp"
    error = abs(parts_volume - mold_volume) / max(mold_volume, 1e-12)
    data = {"relative_error": error}
    if error <= qa.VOLUME_BALANCE_TOL:
        return qa.CheckResult(
            name,
            qa.CheckStatus.PASSED,
            f"Parçaların toplam hacmi kalıba eşit (sapma %{error * 100:.4f}).",
            data,
        )
    return qa.CheckResult(
        name,
        qa.CheckStatus.ERROR,
        f"Parça hacimleri kalıbı tutmuyor (sapma %{error * 100:.2f}).",
        data,
    )


def check_boundaries(
    parts: list[MoldPart], plane: PartingPlane, pins: PinLayout | None
) -> qa.CheckResult:
    """Part 1 must lie below the plane (pins excepted), part 2 above it."""
    name = "Parça sınırları"
    n = np.asarray(plane.unit_normal())
    tol = 1e-6 * max(float(np.linalg.norm(parts[0].mesh.extents)), 1.0)
    pin_reach = pins.params.length if pins is not None and pins.pins else 0.0
    above = float((np.asarray(parts[0].mesh.vertices) @ n).max()) - plane.offset
    below = plane.offset - float((np.asarray(parts[1].mesh.vertices) @ n).min())
    if above <= pin_reach + tol and below <= tol:
        return qa.CheckResult(name, qa.CheckStatus.PASSED, "Parçalar ayırma düzleminde buluşuyor.")
    return qa.CheckResult(
        name,
        qa.CheckStatus.ERROR,
        "Parça düzlemin yanlış tarafına taşıyor.",
        {"above": above, "below": below},
    )


def check_pins(layout: PinLayout, socket_part: trimesh.Trimesh) -> qa.CheckResult:
    """Every requested pin must be valid and must not interfere with the socket part."""
    name = "Pim/yuva eşleşmesi"
    rejected = [p for p in layout.placements if not p.valid]
    clashes = 0
    for pin in layout.pins:
        if overlap_volume(pin, socket_part) > 1e-6:
            clashes += 1
    data = {"pins": len(layout.pins), "rejected": len(rejected), "clashes": clashes}
    if clashes:
        return qa.CheckResult(name, qa.CheckStatus.ERROR, f"{clashes} pim yuvasına sığmıyor.", data)
    if not layout.pins:
        return qa.CheckResult(
            name,
            qa.CheckStatus.ERROR,
            "Geçerli pim konumu yok; payları büyütün veya pimleri elle yerleştirin.",
            data,
        )
    if rejected:
        reasons = "; ".join(sorted({p.reason for p in rejected}))
        return qa.CheckResult(
            name, qa.CheckStatus.WARNING, f"{len(rejected)} pim konumu reddedildi: {reasons}", data
        )
    return qa.CheckResult(
        name,
        qa.CheckStatus.PASSED,
        f"{len(layout.pins)} pim, Ø{layout.params.diameter:g} mm, çap boşluğu "
        f"{layout.params.clearance:g} mm.",
        data,
    )


def check_undercuts(report: UndercutReport) -> qa.CheckResult:
    name = "Ters açı (undercut)"
    data = {"area": report.undercut_area, "fraction": report.undercut_fraction}
    if report.has_undercuts:
        return qa.CheckResult(
            name,
            qa.CheckStatus.WARNING,
            f"Kalıptan çıkmayı engelleyen yüzeyler var: {report.undercut_area:.1f} mm² "
            f"(temas yüzeyinin %{report.undercut_fraction * 100:.1f}). İşaretli yüzeylere bakın.",
            data,
        )
    return qa.CheckResult(name, qa.CheckStatus.PASSED, "Ters açı bulunmadı.", data)


def _check_single_piece(mesh: trimesh.Trimesh, label: str = "Kalıp") -> qa.CheckResult:
    shells = mesh.split(only_watertight=False)
    solids = sum(1 for s in shells if s.volume > 0)
    name = f"Tek parça: {label}"
    if solids == 1:
        return qa.CheckResult(name, qa.CheckStatus.PASSED, f"{label} tek parça.")
    return qa.CheckResult(
        name,
        qa.CheckStatus.ERROR,
        f"{label} {solids} ayrı parçaya bölünmüş.",
        {"solids": solids, "components": count_components(mesh)},
    )


# ---------------------------------------------------------------- Mode C


@dataclass
class PartInfo:
    """Per-part metadata for N-part molds."""

    part_id: int
    signs: tuple[bool, ...]
    pull_dir: tuple[float, float, float]
    undercut_area: float


def n_part(
    mold: MoldResult,
    planes: Sequence[PartingPlane],
    params: MoldParams,
    pin_params: PinParams | None = None,
) -> SplitResult:
    """Cut the closed mold with every plane; each connected piece becomes a part."""
    planes = list(planes)
    if not planes:
        raise GeometryError("Çok parçalı kalıp için en az bir ayırma düzlemi girin.", "no planes")
    model_heights = [
        np.asarray(mold.cavity_model.vertices) @ np.asarray(p.unit_normal()) for p in planes
    ]
    for plane, heights in zip(planes, model_heights, strict=True):
        if not heights.min() < plane.offset < heights.max():
            raise GeometryError(
                f"Düzlem (ofset {plane.offset:.2f}) modeli kesmiyor; kaldırın veya taşıyın.",
                f"plane {plane} misses model",
            )
    pieces = [mold.mold]
    for plane in planes:
        next_pieces = []
        for piece in pieces:
            positive, negative = split_by_plane(piece, plane.unit_normal(), plane.offset)
            next_pieces.extend(p for p in (negative, positive) if p is not None)
        pieces = next_pieces
    solids = [s for piece in pieces for s in _solids(piece)]
    raw_volume = float(sum(s.volume for s in solids))
    solids.sort(key=lambda s: tuple(np.round(s.bounds.mean(axis=0), 6)))

    cells = analyze_n_part(mold.cavity_model, planes)
    parts, infos = [], []
    for index, solid in enumerate(solids, start=1):
        signs = _signs(solid, planes)
        cell = next((c for c in cells if c.signs == signs), None)
        pull = cell.pull_dir if cell is not None else _default_pull(solid, planes, signs)
        area = cell.undercut_area if cell is not None else 0.0
        parts.append(MoldPart(index, f"kalip_parca_{index}", solid))
        infos.append(PartInfo(index, signs, pull, area))

    pins, pin_check = None, None
    if pin_params is not None and pin_params.count > 0:
        parts, pins, pin_check = _n_part_pins(parts, planes, mold, params, pin_params)

    undercut = UndercutReport(
        planes[0].unit_normal(),
        _undercut_mask(mold.cavity_model, cells),
        float(sum(c.undercut_area for c in cells)),
        float(mold.cavity_model.area),
    )
    result = SplitResult(
        "C", parts, mold.model, mold.cavity_model, undercut, planes=planes, pins=pins
    )
    result.part_info = infos
    result.assembly_order = assembly_order(parts, planes)
    result.checks = n_part_checks(result, mold, raw_volume, pin_check)
    return result


def _solids(mesh: trimesh.Trimesh) -> list[trimesh.Trimesh]:
    """Split into connected solids (an outer shell plus any voids inside it)."""
    pieces = to_manifold(mesh).decompose()
    return [from_manifold(p) for p in pieces if not p.is_empty()]


def _signs(solid: trimesh.Trimesh, planes: Sequence[PartingPlane]) -> tuple[bool, ...]:
    centre = np.asarray(solid.center_mass)
    return tuple(bool(centre @ np.asarray(p.unit_normal()) >= p.offset) for p in planes)


def _default_pull(
    solid: trimesh.Trimesh, planes: Sequence[PartingPlane], signs: tuple[bool, ...]
) -> tuple[float, float, float]:
    n = np.asarray(planes[0].unit_normal()) * (1 if signs[0] else -1)
    return (float(n[0]), float(n[1]), float(n[2]))


def _undercut_mask(model: trimesh.Trimesh, cells: Sequence[CellReport]) -> np.ndarray:
    """Faces that are blocked for their own cell's pull direction."""
    mask = np.zeros(len(model.faces), dtype=bool)
    for cell in cells:
        if cell.undercut_area > 0:
            mask[cell.face_ids] = blocked_faces(model, np.asarray(cell.pull_dir), cell.face_ids)
    return mask


def assembly_order(parts: Sequence[MoldPart], planes: Sequence[PartingPlane]) -> list[int]:
    """Heuristic order: by part centre along the first plane normal (bottom/first side up)."""
    n = np.asarray(planes[0].unit_normal())
    return [p.part_id for p in sorted(parts, key=lambda p: float(p.mesh.center_mass @ n))]


def check_interference(parts: Sequence[MoldPart]) -> qa.CheckResult:
    """No two parts may share volume."""
    name = "Parçalar arası çakışma"
    clashes = []
    for i, a in enumerate(parts):
        for b in parts[i + 1 :]:
            if np.any(a.mesh.bounds[1] < b.mesh.bounds[0]) or np.any(
                b.mesh.bounds[1] < a.mesh.bounds[0]
            ):
                continue
            shared = overlap_volume(a.mesh, b.mesh)
            if shared > 1e-6:
                clashes.append(f"{a.part_id}-{b.part_id} ({shared:.3f} mm³)")
    if clashes:
        return qa.CheckResult(
            name,
            qa.CheckStatus.ERROR,
            "Çakışan parçalar: " + ", ".join(clashes),
            {"pairs": clashes},
        )
    return qa.CheckResult(name, qa.CheckStatus.PASSED, "Hiçbir parça diğerine girmiyor.")


def n_part_checks(
    result: SplitResult,
    mold: MoldResult,
    raw_volume: float,
    pin_check: qa.CheckResult | None = None,
) -> list[qa.CheckResult]:
    checks = [qa.check_part_count([p.mesh for p in result.parts], len(result.parts))]
    for part in result.parts:
        checks.append(qa.check_watertight(part.mesh, part.name))
    checks.append(check_reunion(raw_volume, float(mold.mold.volume)))
    checks.append(check_interference(result.parts))
    if pin_check is not None:
        checks.append(pin_check)
    for info in result.part_info:
        status = qa.CheckStatus.PASSED if info.undercut_area <= 1e-9 else qa.CheckStatus.WARNING
        direction = ", ".join(f"{c:.2f}" for c in info.pull_dir)
        message = (
            f"Parça {info.part_id}: çıkarma yönü ({direction}), "
            f"ters açı {info.undercut_area:.1f} mm²."
        )
        checks.append(qa.CheckResult(f"Parça {info.part_id} kalıptan çıkma", status, message))
    order = " → ".join(str(i) for i in result.assembly_order)
    checks.append(
        qa.CheckResult(
            "Montaj sırası",
            qa.CheckStatus.MANUAL,
            f"Önerilen montaj sırası: {order} (sezgisel; kontrol edin).",
        )
    )
    return checks


def _n_part_pins(
    parts: list[MoldPart],
    planes: Sequence[PartingPlane],
    mold: MoldResult,
    params: MoldParams,
    pin_params: PinParams,
) -> tuple[list[MoldPart], PinLayout, qa.CheckResult]:
    """Pins per plane; a pin is kept only if its pin and socket regions each lie inside a
    single part (so it never straddles another plane)."""
    meshes = {p.part_id: p.mesh for p in parts}
    placements, pins, sockets, socket_parts = [], [], [], []
    wall = params.min_wall_thickness
    for plane in planes:
        layout = plan_pins(plane, mold.cavity_model, mold.body, pin_params, wall)
        r_keep = pin_params.socket_diameter / 2 + wall
        for placement in layout.placements:
            if not placement.valid:
                placements.append(placement)
                continue
            z = plane.offset
            lower = pin_solid(plane, placement.xy, r_keep, z - wall, z, 32)
            upper = pin_solid(
                plane, placement.xy, r_keep, z, z + pin_params.socket_depth + wall, 32
            )
            low_id = _containing_part(meshes, lower)
            up_id = _containing_part(meshes, upper)
            if low_id is None or up_id is None:
                placements.append(
                    dataclasses.replace(
                        placement,
                        valid=False,
                        reason="Pim başka bir ayırma düzlemini kesiyor veya tek parçaya sığmıyor.",
                    )
                )
                continue
            pin = pin_solid(
                plane,
                placement.xy,
                pin_params.diameter / 2,
                z - wall / 2,
                z + pin_params.length,
                pin_params.sections,
            )
            socket = pin_solid(
                plane,
                placement.xy,
                pin_params.socket_diameter / 2,
                z - 1.0,
                z + pin_params.socket_depth,
                pin_params.sections,
            )
            meshes[low_id] = union(meshes[low_id], pin).unwrap()
            meshes[up_id] = difference(meshes[up_id], socket).unwrap()
            placements.append(placement)
            pins.append(pin)
            sockets.append(socket)
            socket_parts.append(up_id)
    new_parts = [MoldPart(p.part_id, p.name, meshes[p.part_id]) for p in parts]
    layout = PinLayout(planes[0], pin_params, placements, pins, sockets)
    return new_parts, layout, _n_part_pin_check(pins, socket_parts, meshes, placements)


def _n_part_pin_check(
    pins: list[trimesh.Trimesh],
    socket_parts: list[int],
    meshes: dict[int, trimesh.Trimesh],
    placements: list[object],
) -> qa.CheckResult:
    """Each pin must clear the part that holds its socket."""
    name = "Pim/yuva eşleşmesi"
    clashes = 0
    for pin, up_id in zip(pins, socket_parts, strict=True):
        if overlap_volume(pin, meshes[up_id]) > 1e-6:
            clashes += 1
    rejected = [p for p in placements if not p.valid]  # type: ignore[attr-defined]
    if clashes:
        return qa.CheckResult(name, qa.CheckStatus.ERROR, f"{clashes} pim yuvasına sığmıyor.")
    if not pins:
        return qa.CheckResult(
            name,
            qa.CheckStatus.ERROR,
            "Geçerli pim konumu yok; payları büyütün veya düzlemleri değiştirin.",
        )
    if rejected:
        return qa.CheckResult(
            name,
            qa.CheckStatus.WARNING,
            f"{len(pins)} pim eklendi, {len(rejected)} konum reddedildi.",
        )
    return qa.CheckResult(name, qa.CheckStatus.PASSED, f"{len(pins)} pim eklendi.")


def _containing_part(meshes: dict[int, trimesh.Trimesh], region: trimesh.Trimesh) -> int | None:
    volume = float(region.volume)
    for part_id, mesh in meshes.items():
        if abs(overlap_volume(region, mesh) - volume) <= 1e-6 * max(volume, 1):
            return part_id
    return None
