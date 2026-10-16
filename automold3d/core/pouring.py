"""Pour spout and air vents (both off by default).

No flow simulation is done. Air-trap points are only *suggestions* ("öneri"): local maxima
of the cavity surface along the pour direction (the spout goes at the highest one).
Every channel is verified to reach the cavity and to open to the outside.
"""

from __future__ import annotations

import dataclasses
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field

import manifold3d as m3
import numpy as np
import trimesh

from automold3d.core import geometry_checks as qa
from automold3d.core.boolean_engine import difference, from_manifold, overlap_volume, to_manifold
from automold3d.core.errors import GeometryError
from automold3d.core.frames import align_to_z, as_3x4, unit
from automold3d.core.params import PouringParams
from automold3d.core.splitter import MoldPart, SplitResult

log = logging.getLogger(__name__)

# How far a channel starts inside the cavity, and how far it pokes out of the mold (mm).
CHANNEL_INSET = 1.0
CHANNEL_OVERSHOOT = 2.0
# Heights within this of a local maximum belong to the same flat top (mm).
FLAT_TOL = 1e-3
_MIN_OVERLAP = 1e-6


@dataclass
class AirTrapSuggestion:
    """A local high point of the cavity along the pour direction ("öneri")."""

    point: tuple[float, float, float]
    height: float


@dataclass
class Channel:
    kind: str  # "spout" | "vent"
    position: tuple[float, float, float]
    diameter: float
    start: tuple[float, float, float]
    end: tuple[float, float, float]
    mesh: trimesh.Trimesh

    @property
    def label(self) -> str:
        return "Döküm ağzı" if self.kind == "spout" else "Hava kanalı"


@dataclass
class PouringResult:
    channels: list[Channel] = field(default_factory=list)
    suggestions: list[AirTrapSuggestion] = field(default_factory=list)
    checks: list[qa.CheckResult] = field(default_factory=list)


def air_trap_suggestions(
    cavity: trimesh.Trimesh, pour_dir: Sequence[float], min_spacing: float
) -> list[AirTrapSuggestion]:
    """Local maxima of the cavity along pour_dir, highest first, at least min_spacing apart.

    A flat top counts once, at its vertex nearest the top region's centroid.
    """
    u = unit(pour_dir)
    vertices = np.asarray(cavity.vertices)
    heights = vertices @ u
    edges = np.asarray(cavity.edges_unique)
    neighbour_max = np.full(len(vertices), -np.inf)
    np.maximum.at(neighbour_max, edges[:, 0], heights[edges[:, 1]])
    np.maximum.at(neighbour_max, edges[:, 1], heights[edges[:, 0]])
    is_peak = heights >= neighbour_max - FLAT_TOL
    # Plateaus: connected peak vertices at (nearly) the same height form one candidate.
    peak_edges = edges[
        is_peak[edges[:, 0]]
        & is_peak[edges[:, 1]]
        & (np.abs(heights[edges[:, 0]] - heights[edges[:, 1]]) <= FLAT_TOL)
    ]
    peak_ids = np.flatnonzero(is_peak)
    labels = trimesh.graph.connected_component_labels(peak_edges, node_count=len(vertices))
    # A plateau is a real local maximum only if every neighbour outside it is lower
    # (rejects e.g. the centre vertex of a flat face that is surrounded by equal heights).
    outside_max = np.full(labels.max() + 1, -np.inf)
    for a, b in ((edges[:, 0], edges[:, 1]), (edges[:, 1], edges[:, 0])):
        crossing = is_peak[a] & (labels[a] != labels[b])
        np.maximum.at(outside_max, labels[a][crossing], heights[b][crossing])
    plateau_height = np.full(labels.max() + 1, -np.inf)
    np.maximum.at(plateau_height, labels[peak_ids], heights[peak_ids])
    real = outside_max < plateau_height - FLAT_TOL
    peak_ids = peak_ids[real[labels[peak_ids]]]
    solid = to_manifold(cavity)
    faces = np.asarray(cavity.faces)
    areas = np.asarray(cavity.area_faces)
    centers = np.asarray(cavity.triangles_center)
    candidates: list[AirTrapSuggestion] = []
    for label in np.unique(labels[peak_ids]):
        members = peak_ids[labels[peak_ids] == label]
        point = _plateau_point(members, labels, label, vertices, faces, areas, centers, u, solid)
        candidates.append(AirTrapSuggestion(_t(point), float(point @ u)))
    candidates.sort(key=lambda c: -c.height)
    chosen: list[AirTrapSuggestion] = []
    for cand in candidates:
        if all(np.linalg.norm(np.subtract(cand.point, c.point)) >= min_spacing for c in chosen):
            chosen.append(cand)
    return chosen


def _plateau_point(
    members: np.ndarray,
    labels: np.ndarray,
    label: int,
    vertices: np.ndarray,
    faces: np.ndarray,
    areas: np.ndarray,
    centers: np.ndarray,
    u: np.ndarray,
    solid: m3.Manifold,
) -> np.ndarray:
    """A point on the plateau whose channel start (point - u*inset) lies inside the cavity."""
    if len(members) == 1:
        return vertices[members[0]]
    on_plateau = np.all(labels[faces] == label, axis=1)
    if on_plateau.any():
        weights = areas[on_plateau]
        centroid = (centers[on_plateau] * weights[:, None]).sum(axis=0) / weights.sum()
        if point_inside(solid, centroid - u * CHANNEL_INSET):
            return centroid
        return centers[on_plateau][np.argmax(weights)]
    centroid = vertices[members].mean(axis=0)
    return vertices[members[np.argmin(np.linalg.norm(vertices[members] - centroid, axis=1))]]


def point_inside(solid: m3.Manifold, point: np.ndarray) -> bool:
    """Ray parity test; the odd direction avoids grazing edges of axis-aligned meshes."""
    direction = unit((0.5773, 0.5774, 0.5775))
    lo, hi = np.asarray(solid.bounding_box()[:3]), np.asarray(solid.bounding_box()[3:])
    reach = float(np.linalg.norm(hi - lo)) * 2 + 1.0
    p = np.asarray(point, dtype=float)
    hits = solid.ray_cast(tuple(p), tuple(p + direction * reach))
    return len(hits) % 2 == 1


def channel_mesh(
    position: Sequence[float],
    pour_dir: Sequence[float],
    diameter: float,
    top_height: float,
    sections: int,
) -> tuple[trimesh.Trimesh, np.ndarray, np.ndarray]:
    """Cylinder from just inside the cavity at `position` up (along pour_dir) to top_height."""
    u = unit(pour_dir)
    p = np.asarray(position, dtype=float)
    start = p - u * CHANNEL_INSET
    end = p + u * (top_height - float(p @ u))
    length = float((end - start) @ u)
    if length <= 0:
        raise GeometryError(
            "Kanal konumu kalıbın üstünde; kanal oluşturulamaz.",
            f"non-positive channel length at {position}",
        )
    rotation = align_to_z(u)
    local_start = rotation[:3, :3] @ start
    solid = m3.Manifold.cylinder(length, diameter / 2, diameter / 2, sections).translate(
        tuple(local_start)
    )
    mesh = from_manifold(solid.transform(as_3x4(np.linalg.inv(rotation))))
    return mesh, start, end


def plan_channels(
    result: SplitResult, params: PouringParams, spout: bool, vents: bool
) -> tuple[list[Channel], list[AirTrapSuggestion]]:
    errors = params.validate()
    if errors:
        raise GeometryError(" ".join(errors), f"invalid pouring params {params}")
    u = unit(params.pour_dir)
    cavity = result.cavity_model
    top = max(float((np.asarray(p.mesh.vertices) @ u).max()) for p in result.parts)
    top += CHANNEL_OVERSHOOT
    spacing = max(params.spout_diameter, 3 * params.vent_diameter)
    suggestions = air_trap_suggestions(cavity, u, spacing)
    channels: list[Channel] = []
    spout_point = params.spout_position or (suggestions[0].point if suggestions else None)
    if spout and spout_point is not None:
        mesh, start, end = channel_mesh(spout_point, u, params.spout_diameter, top, params.sections)
        channels.append(
            Channel("spout", tuple(spout_point), params.spout_diameter, _t(start), _t(end), mesh)
        )
    if vents:
        if params.vent_positions is not None:
            points = list(params.vent_positions)
        else:
            # Highest suggestion is taken by the spout (when there is one).
            points = [
                sg.point
                for sg in suggestions
                if not (spout and spout_point is not None)
                or np.linalg.norm(np.subtract(sg.point, spout_point)) >= spacing
            ]
            points = points[: params.vent_count]
        for point in points:
            mesh, start, end = channel_mesh(point, u, params.vent_diameter, top, params.sections)
            channels.append(
                Channel("vent", tuple(point), params.vent_diameter, _t(start), _t(end), mesh)
            )
    return channels, suggestions


def apply_channels(
    result: SplitResult, params: PouringParams, spout: bool, vents: bool
) -> tuple[SplitResult, PouringResult]:
    """Cut the channels into every mold part and verify each one."""
    channels, suggestions = plan_channels(result, params, spout, vents)
    parts = []
    for part in result.parts:
        mesh = part.mesh
        for channel in channels:
            mesh = difference(mesh, channel.mesh).unwrap()
        parts.append(MoldPart(part.part_id, part.name, mesh))
    pouring = PouringResult(channels, suggestions)
    pouring.checks = [check_channel(c, parts, result.cavity_model) for c in channels]
    if result.pins is not None and result.pins.pins:
        pouring.checks.append(check_pin_clearance(channels, result))
    if vents and not any(c.kind == "vent" for c in channels):
        pouring.checks.append(
            qa.CheckResult(
                "Hava kanalları",
                qa.CheckStatus.MANUAL,
                "Hava kapanı önerisi bulunamadı; gerekirse kanal konumlarını elle girin.",
            )
        )
    new = dataclasses.replace(
        result,
        parts=parts,
        checks=[*result.checks, *pouring.checks],
        channels=channels,
        air_traps=suggestions,
    )
    log.info("Channels applied: %s", [(c.kind, c.position) for c in channels])
    return new, pouring


def check_channel(
    channel: Channel, parts: Sequence[MoldPart], cavity: trimesh.Trimesh
) -> qa.CheckResult:
    """Reaches the cavity, open path along its axis, and exits above every part."""
    name = f"{channel.label} bağlantısı ({', '.join(f'{c:.1f}' for c in channel.position)})"
    start = np.asarray(channel.start)
    end = np.asarray(channel.end)
    if not point_inside(to_manifold(cavity), start):
        return qa.CheckResult(
            name,
            qa.CheckStatus.ERROR,
            f"{channel.label} kalıp boşluğuna ulaşmıyor (bağlantısız): "
            "başlangıcı boşluğun içinde değil.",
        )
    axis = (end - start) / np.linalg.norm(end - start)
    ray_start = start + axis * 1e-3  # do not count the channel's own bottom cap
    if any(to_manifold(p.mesh).ray_cast(_t(ray_start), _t(end)) for p in parts):
        return qa.CheckResult(
            name,
            qa.CheckStatus.ERROR,
            f"{channel.label} dış yüzeye açılmıyor; yol malzemeyle kapalı.",
        )
    return qa.CheckResult(
        name,
        qa.CheckStatus.PASSED,
        f"{channel.label} boşluğu dışarı bağlıyor (Ø{channel.diameter:g} mm).",
    )


def check_pin_clearance(channels: Sequence[Channel], result: SplitResult) -> qa.CheckResult:
    name = "Kanal/pim çakışması"
    layout = result.pins
    assert layout is not None
    clashes = 0
    for channel in channels:
        for solid in [*layout.pins, *layout.sockets]:
            if overlap_volume(channel.mesh, solid) > _MIN_OVERLAP:
                clashes += 1
    if clashes:
        return qa.CheckResult(
            name,
            qa.CheckStatus.WARNING,
            f"{clashes} kanal bir pim/yuvayla çakışıyor; konumları değiştirin.",
        )
    return qa.CheckResult(name, qa.CheckStatus.PASSED, "Kanallar pimlerle çakışmıyor.")


def _t(v: np.ndarray) -> tuple[float, float, float]:
    return (float(v[0]), float(v[1]), float(v[2]))
