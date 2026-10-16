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


# ---------------------------------------------------------------- N-part (Mode C)


@dataclass
class CellReport:
    """Model faces touched by one cell of the plane arrangement, and how it demolds."""

    signs: tuple[bool, ...]
    face_ids: np.ndarray
    pull_dir: tuple[float, float, float]
    undercut_area: float


@dataclass
class AutoPlanesResult:
    planes: list[PartingPlane]
    undercut_area: float
    success: bool
    message: str


def face_cells(centers: np.ndarray, planes: list[PartingPlane]) -> np.ndarray:
    """Bool matrix (faces x planes): which side of each plane a face centre lies on."""
    if not planes:
        return np.zeros((len(centers), 0), dtype=bool)
    normals = np.array([p.unit_normal() for p in planes])
    offsets = np.array([p.offset for p in planes])
    return centers @ normals.T >= offsets


def analyze_n_part(model: trimesh.Trimesh, planes: list[PartingPlane]) -> list[CellReport]:
    """For each cell: pick the bounding-plane direction (±n) with the least undercut area."""
    centers = np.asarray(model.triangles_center)
    areas = np.asarray(model.area_faces)
    sides = face_cells(centers, planes)
    cache: dict[tuple[float, ...], np.ndarray] = {}
    reports = []
    for signs in {tuple(row) for row in sides}:
        ids = np.flatnonzero(np.all(sides == np.array(signs, dtype=bool), axis=1))
        best: tuple[float, tuple[float, float, float]] | None = None
        for plane, positive in zip(planes, signs, strict=True):
            d = np.asarray(plane.unit_normal()) * (1 if positive else -1)
            key = tuple(np.round(d, 9))
            if key not in cache:
                cache[key] = blocked_faces(model, d)
            area = float(areas[ids][cache[key][ids]].sum())
            if best is None or area < best[0]:
                best = (area, (float(d[0]), float(d[1]), float(d[2])))
        assert best is not None
        reports.append(CellReport(signs, ids, best[1], best[0]))
    return reports


def auto_parting_planes(
    model: trimesh.Trimesh, max_parts: int = 3, offsets_per_direction: int = 21
) -> AutoPlanesResult:
    """Best-effort greedy plane selection for up to `max_parts` slabs/cells.

    Adds one plane at a time (from the same candidates as the two-part suggestion) while it
    lowers the total undercut area. Reports failure honestly when undercuts remain.
    """
    areas = np.asarray(model.area_faces)
    ids = _scoring_sample(areas, seed=0)
    sampled = len(ids) < len(areas)
    weights = np.full(len(ids), areas.sum() / len(ids)) if sampled else areas
    centers = np.asarray(model.triangles_center)[ids]
    blocked: dict[tuple[float, ...], np.ndarray] = {}
    candidates: list[PartingPlane] = []
    for n in candidate_directions():
        for d in (n, -n):
            blocked[tuple(np.round(d, 9))] = blocked_faces(model, d, ids)
        heights = centers @ n
        lo, hi = float(heights.min()), float(heights.max())
        for t in np.linspace(0.05, 0.95, offsets_per_direction):
            candidates.append(PartingPlane(tuple(float(x) for x in n), lo + t * (hi - lo)))

    def score(planes: list[PartingPlane]) -> float:
        sides = face_cells(centers, planes)
        total = 0.0
        for signs in {tuple(row) for row in sides}:
            mask = np.all(sides == np.array(signs, dtype=bool), axis=1)
            options = [
                float(
                    weights[
                        mask
                        & blocked[
                            tuple(np.round(np.asarray(p.unit_normal()) * (1 if s else -1), 9))
                        ]
                    ].sum()
                )
                for p, s in zip(planes, signs, strict=True)
            ]
            total += min(options)
        return total

    chosen: list[PartingPlane] = []
    current = float("inf")
    for _ in range(max(max_parts - 1, 1)):
        best_plane, best_score = None, current
        for plane in candidates:
            if plane in chosen:
                continue
            value = score([*chosen, plane])
            if value < best_score - 1e-9:
                best_plane, best_score = plane, value
        if best_plane is None:
            break
        chosen.append(best_plane)
        current = best_score
        if current <= 1e-9:
            break
    if not chosen:
        return AutoPlanesResult(
            [], float("inf"), False, "Otomatik bölme düzlem bulamadı; düzlemleri elle girin."
        )
    if current > 1e-9:
        return AutoPlanesResult(
            chosen,
            current,
            False,
            f"Otomatik bölme ters açıları gideremedi (kalan {current:.1f} mm²). Önerilen "
            "düzlemler başlangıç olarak yazıldı; düzlemleri elle düzenleyin.",
        )
    return AutoPlanesResult(
        chosen, 0.0, True, f"{len(chosen)} düzlemle ters açısız bölme bulundu (öneri)."
    )
