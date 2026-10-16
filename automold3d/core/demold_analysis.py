"""Undercut detection and parting-plane suggestion.

Convention: a mold part touching a model face moves away along `move_dir`. The face is an
undercut when the mold material just outside the face would run into the model, i.e. a ray
from the face along `move_dir` enters the model (this includes n·move_dir < 0).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import trimesh

from automold3d.core.boolean_engine import to_manifold
from automold3d.core.frames import align_to_z, as_3x4, unit
from automold3d.core.params import PartingPlane

log = logging.getLogger(__name__)

# n·dir below this counts as facing into the move direction (≈ 0.5°).
FACING_TOL = np.sin(np.radians(0.5))
# Faces sampled per direction when scoring planes on large meshes.
MAX_SCORING_FACES = 20_000
CANDIDATE_OFFSETS = 41


@dataclass
class UndercutReport:
    move_dir: tuple[float, float, float]
    face_mask: np.ndarray  # bool per model face: True = undercut
    undercut_area: float
    contact_area: float

    @property
    def has_undercuts(self) -> bool:
        return bool(self.face_mask.any())

    @property
    def undercut_fraction(self) -> float:
        return self.undercut_area / self.contact_area if self.contact_area > 0 else 0.0


@dataclass
class PlaneScore:
    plane: PartingPlane
    undercut_area: float
    section_area: float


def blocked_faces(
    model: trimesh.Trimesh, move_dir: np.ndarray, face_ids: np.ndarray | None = None
) -> np.ndarray:
    """Bool per face in `face_ids` (default: all): would mold material moving along move_dir hit?"""
    ids = np.arange(len(model.faces)) if face_ids is None else np.asarray(face_ids)
    d = unit(move_dir)
    normals = np.asarray(model.face_normals)[ids]
    centers = np.asarray(model.triangles_center)[ids]
    blocked = normals @ d < -FACING_TOL
    reach = float(np.linalg.norm(model.extents)) * 2 + 1.0
    eps = max(float(np.linalg.norm(model.extents)) * 1e-5, 1e-6)
    solid = to_manifold(model)
    for k in np.flatnonzero(~blocked):
        origin = centers[k] + normals[k] * eps
        if solid.ray_cast(tuple(origin), tuple(origin + d * reach)):
            blocked[k] = True
    return blocked


def analyze_open_mold(
    model: trimesh.Trimesh, pull_dir: tuple[float, float, float], opening_offset: float
) -> UndercutReport:
    """One-part open mold: the casting is pulled out along pull_dir; faces below the opening
    plane (pull_dir·x < opening_offset) touch the mold, which moves along -pull_dir."""
    o = unit(pull_dir)
    centers = np.asarray(model.triangles_center)
    contact = centers @ o < opening_offset - 1e-9
    mask = np.zeros(len(model.faces), dtype=bool)
    ids = np.flatnonzero(contact)
    mask[ids] = blocked_faces(model, -o, ids)
    areas = np.asarray(model.area_faces)
    return UndercutReport(
        tuple(float(x) for x in -o), mask, float(areas[mask].sum()), float(areas[contact].sum())
    )


def analyze_two_part(model: trimesh.Trimesh, plane: PartingPlane) -> UndercutReport:
    """Each half moves away from the plane along its own side's normal."""
    n = unit(plane.normal)
    centers = np.asarray(model.triangles_center)
    positive = centers @ n >= plane.offset
    mask = np.zeros(len(model.faces), dtype=bool)
    for side, direction in ((positive, n), (~positive, -n)):
        ids = np.flatnonzero(side)
        if len(ids):
            mask[ids] = blocked_faces(model, direction, ids)
    areas = np.asarray(model.area_faces)
    return UndercutReport(
        tuple(float(x) for x in n), mask, float(areas[mask].sum()), float(areas.sum())
    )


def candidate_directions(include_diagonals: bool = True) -> list[np.ndarray]:
    dirs = [np.array(v, dtype=float) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
    if include_diagonals:
        for v in ((1, 1, 0), (1, -1, 0), (1, 0, 1), (1, 0, -1), (0, 1, 1), (0, 1, -1)):
            dirs.append(unit(v))
    return dirs


def suggest_parting_planes(
    model: trimesh.Trimesh,
    directions: list[np.ndarray] | None = None,
    offsets_per_direction: int = CANDIDATE_OFFSETS,
    seed: int = 0,
) -> list[PlaneScore]:
    """Score candidate planes by total undercut area of both halves (lower is better).

    Ties are broken by the larger model cross-section (parting at the widest point).
    Large meshes are scored on an area-weighted random face sample.
    """
    dirs = directions or candidate_directions()
    areas = np.asarray(model.area_faces)
    ids = _scoring_sample(areas, seed)
    centers = np.asarray(model.triangles_center)[ids]
    # An area-weighted sample is unbiased with equal weights per sampled face.
    sampled = len(ids) < len(areas)
    weights = np.full(len(ids), areas.sum() / len(ids)) if sampled else areas
    solid = to_manifold(model)
    scores: list[PlaneScore] = []
    for n in dirs:
        up = blocked_faces(model, n, ids)
        down = blocked_faces(model, -n, ids)
        heights = centers @ n
        rotated = solid.transform(as_3x4(align_to_z(n)))
        lo, hi = float(heights.min()), float(heights.max())
        span = hi - lo
        for t in np.linspace(0.02, 0.98, offsets_per_direction):
            offset = lo + t * span
            positive = heights >= offset
            area = float(weights[(positive & up) | (~positive & down)].sum())
            plane = PartingPlane(tuple(float(x) for x in n), offset)
            scores.append(PlaneScore(plane, area, float(rotated.slice(offset).area())))
    scores.sort(key=lambda s: (round(s.undercut_area, 6), -s.section_area))
    log.info("Best parting plane: %s undercut=%.3f", scores[0].plane, scores[0].undercut_area)
    return scores


def _scoring_sample(areas: np.ndarray, seed: int) -> np.ndarray:
    if len(areas) <= MAX_SCORING_FACES:
        return np.arange(len(areas))
    rng = np.random.default_rng(seed)
    return np.sort(rng.choice(len(areas), MAX_SCORING_FACES, replace=False, p=areas / areas.sum()))
