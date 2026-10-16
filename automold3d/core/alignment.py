"""Registration pins and sockets on a parting plane.

Work happens in a frame where the plane normal is +Z and the plane is z = offset. Pins sit
on the negative-side part and protrude +Z; sockets are cut into the positive-side part.
Every placement is validated with exact Booleans: the socket, grown by the minimum wall
thickness, must not touch the cavity and must lie fully inside the outer body.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass

import manifold3d as m3
import numpy as np
import trimesh

from automold3d.core.boolean_engine import from_manifold, to_manifold
from automold3d.core.errors import GeometryError
from automold3d.core.frames import align_to_z, as_3x4
from automold3d.core.params import PartingPlane, PinParams

log = logging.getLogger(__name__)

_VOLUME_EPS = 1e-6
# Extra safety distance kept from the valid-region boundary for auto placement (mm).
_PLACEMENT_SLACK = 0.05


@dataclass
class PinPlacement:
    """A pin centre in plane coordinates (x, y of the rotated frame) plus its validation."""

    xy: tuple[float, float]
    valid: bool
    reason: str = ""


@dataclass
class PinLayout:
    plane: PartingPlane
    params: PinParams
    placements: list[PinPlacement]
    pins: list[trimesh.Trimesh]  # world coordinates
    sockets: list[trimesh.Trimesh]  # world coordinates

    @property
    def valid_count(self) -> int:
        return sum(p.valid for p in self.placements)


class _Frame:
    """Plane frame: rotation to +Z and the cavity/body as manifolds in that frame."""

    def __init__(self, plane: PartingPlane, cavity: trimesh.Trimesh, body: trimesh.Trimesh) -> None:
        self.plane = plane
        self.rotation = align_to_z(plane.unit_normal())
        self.inverse = np.linalg.inv(self.rotation)
        self.cavity = to_manifold(cavity).transform(as_3x4(self.rotation))
        self.body = to_manifold(body).transform(as_3x4(self.rotation))

    def to_world(self, solid: m3.Manifold) -> trimesh.Trimesh:
        return from_manifold(solid.transform(as_3x4(self.inverse)))


def _cylinder(
    radius: float, z0: float, z1: float, xy: tuple[float, float], sections: int
) -> m3.Manifold:
    return m3.Manifold.cylinder(z1 - z0, radius, radius, sections).translate((xy[0], xy[1], z0))


def _keepout(
    frame: _Frame, params: PinParams, min_wall: float, xy: tuple[float, float]
) -> m3.Manifold:
    z = frame.plane.offset
    radius = params.socket_diameter / 2 + min_wall
    return _cylinder(
        radius, z - min_wall, z + params.socket_depth + min_wall, xy, max(params.sections, 32)
    )


def validate_position(
    frame: _Frame, params: PinParams, min_wall: float, xy: tuple[float, float]
) -> PinPlacement:
    keepout = _keepout(frame, params, min_wall, xy)
    if (keepout ^ frame.cavity).volume() > _VOLUME_EPS:
        return PinPlacement(xy, False, "Pim/yuva kalıp boşluğuna minimum duvar mesafesinden yakın.")
    if keepout.volume() - (keepout ^ frame.body).volume() > _VOLUME_EPS:
        return PinPlacement(xy, False, "Pim/yuva dış duvara minimum duvar mesafesinden yakın.")
    return PinPlacement(xy, True)


def allowed_region(frame: _Frame, params: PinParams, min_wall: float) -> m3.CrossSection:
    """2D region of valid pin centres (conservative; final check is validate_position)."""
    z = frame.plane.offset
    z0, z1 = z - min_wall, z + params.socket_depth + min_wall
    grow = params.socket_diameter / 2 + min_wall + _PLACEMENT_SLACK
    inside = frame.body.slice(z0).offset(-grow, m3.JoinType.Round) ^ frame.body.slice(z1).offset(
        -grow, m3.JoinType.Round
    )
    lo, hi = frame.body.bounding_box()[:3], frame.body.bounding_box()[3:]
    slab = m3.Manifold.cube((hi[0] - lo[0] + 2, hi[1] - lo[1] + 2, z1 - z0)).translate(
        (lo[0] - 1, lo[1] - 1, z0)
    )
    shadow = (frame.cavity ^ slab).project().offset(grow, m3.JoinType.Round)
    return inside - shadow


def auto_positions(region: m3.CrossSection, count: int) -> list[tuple[float, float]]:
    """Spread `count` points over the region's outline by farthest-point sampling."""
    polygons = [np.asarray(p, dtype=float) for p in region.to_polygons()]
    if count <= 0 or not polygons:
        return []
    points = np.vstack(polygons)
    centroid = points.mean(axis=0)
    chosen = [int(np.argmax(np.linalg.norm(points - centroid, axis=1)))]
    dist = np.linalg.norm(points - points[chosen[0]], axis=1)
    while len(chosen) < min(count, len(points)):
        nxt = int(np.argmax(dist))
        if dist[nxt] <= 0:
            break
        chosen.append(nxt)
        dist = np.minimum(dist, np.linalg.norm(points - points[nxt], axis=1))
    return [(float(points[i][0]), float(points[i][1])) for i in chosen]


def plan_pins(
    plane: PartingPlane,
    cavity: trimesh.Trimesh,
    body: trimesh.Trimesh,
    params: PinParams,
    min_wall: float,
    positions: Sequence[tuple[float, float]] | None = None,
) -> PinLayout:
    """Auto (positions=None) or manual pin layout. Invalid manual positions are kept but
    flagged so the UI can show why they were rejected; they get no geometry."""
    errors = params.validate()
    if errors:
        raise GeometryError(" ".join(errors), f"invalid pin params {params}")
    frame = _Frame(plane, cavity, body)
    if positions is None:
        positions = auto_positions(allowed_region(frame, params, min_wall), params.count)
    placements = [validate_position(frame, params, min_wall, tuple(xy)) for xy in positions]
    z = plane.offset
    embed = min_wall / 2
    pins, sockets = [], []
    for placement in placements:
        if not placement.valid:
            continue
        pin = _cylinder(
            params.diameter / 2, z - embed, z + params.length, placement.xy, params.sections
        )
        # The socket starts below the plane (in empty space under the positive part) so the
        # cut never leaves a zero-thickness skin at the parting face.
        socket = _cylinder(
            params.socket_diameter / 2,
            z - 1.0,
            z + params.socket_depth,
            placement.xy,
            params.sections,
        )
        pins.append(frame.to_world(pin))
        sockets.append(frame.to_world(socket))
    log.info(
        "Pins planned: %d requested, %d valid", len(placements), sum(p.valid for p in placements)
    )
    return PinLayout(plane, params, placements, pins, sockets)


def pin_solid(
    plane: PartingPlane, xy: tuple[float, float], radius: float, z0: float, z1: float, sections: int
) -> trimesh.Trimesh:
    """World-space cylinder along the plane normal, z0/z1 measured along the normal."""
    rotation = align_to_z(plane.unit_normal())
    solid = _cylinder(radius, z0, z1, xy, sections)
    return from_manifold(solid.transform(as_3x4(np.linalg.inv(rotation))))


def world_point(plane: PartingPlane, xy: tuple[float, float]) -> np.ndarray:
    """Plane coordinates -> world point on the plane."""
    inverse = np.linalg.inv(align_to_z(plane.unit_normal()))
    return (inverse @ np.array([xy[0], xy[1], plane.offset, 1.0]))[:3]
