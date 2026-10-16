"""Mold modes A (one-part open) and B (two-part with pins)."""

from __future__ import annotations

import dataclasses
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np
import trimesh

from automold3d.core import geometry_checks as qa
from automold3d.core.alignment import PinLayout, plan_pins
from automold3d.core.boolean_engine import difference, intersection, split_by_plane, union
from automold3d.core.demold_analysis import UndercutReport, analyze_open_mold, analyze_two_part
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
        overlap = intersection(pin, socket_part).unwrap()
        if len(overlap.faces) and overlap.volume > 1e-6:
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
