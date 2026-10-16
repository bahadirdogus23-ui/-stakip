"""Safe wrappers around manifold3d Boolean operations.

Every operation: validate inputs -> manifold3d -> on failure repair inputs and retry ->
verify the result (non-empty, watertight, plausible volume) -> structured result.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum

import manifold3d as m3
import numpy as np
import trimesh

from automold3d.core.errors import GeometryError
from automold3d.core.mesh_validation import repair_mesh

log = logging.getLogger(__name__)

# Relative volume tolerance for plausibility checks (float noise, not geometry error).
VOLUME_REL_TOL = 1e-6
VOLUME_ABS_TOL = 1e-6


class BooleanOp(StrEnum):
    UNION = "union"
    DIFFERENCE = "difference"
    INTERSECTION = "intersection"


_OP_NAMES_TR = {
    BooleanOp.UNION: "birleştirme",
    BooleanOp.DIFFERENCE: "çıkarma",
    BooleanOp.INTERSECTION: "kesişim",
}


@dataclass
class BooleanResult:
    """Outcome of a Boolean. `mesh` is None when `ok` is False."""

    ok: bool
    mesh: trimesh.Trimesh | None = None
    user_message: str = ""
    detail: str = ""
    repaired_inputs: bool = False
    warnings: list[str] = field(default_factory=list)

    def unwrap(self) -> trimesh.Trimesh:
        if not self.ok or self.mesh is None:
            raise GeometryError(self.user_message, self.detail)
        return self.mesh


def to_manifold(mesh: trimesh.Trimesh) -> m3.Manifold:
    """Convert to a manifold3d solid. Raises GeometryError if it is not a valid manifold."""
    if len(mesh.faces) == 0:
        raise GeometryError("Boş geometri.", "mesh has no faces")
    if not np.isfinite(mesh.vertices).all():
        raise GeometryError("Geçersiz koordinatlar (NaN/sonsuz).", "non-finite vertices")
    m3_mesh = m3.Mesh64(
        # Fresh writeable copies: manifold3d rejects read-only (cached) trimesh arrays.
        vert_properties=np.array(mesh.vertices, dtype=np.float64, order="C", copy=True),
        tri_verts=np.array(mesh.faces, dtype=np.uint64, order="C", copy=True),
    )
    solid = m3.Manifold(m3_mesh)
    status = solid.status()
    if status != m3.Error.NoError:
        raise GeometryError("Model geçerli kapalı bir katı değil.", f"manifold3d status {status}")
    return solid


def from_manifold(solid: m3.Manifold) -> trimesh.Trimesh:
    out = solid.to_mesh64()
    vertices = np.asarray(out.vert_properties, dtype=np.float64)[:, :3]
    faces = np.asarray(out.tri_verts, dtype=np.int64)
    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)


def boolean(a: trimesh.Trimesh, b: trimesh.Trimesh, op: BooleanOp) -> BooleanResult:
    """Run one Boolean with validation, repair-and-retry and result verification."""
    name = _OP_NAMES_TR[op]
    repaired = False
    try:
        solid_a, solid_b = to_manifold(a), to_manifold(b)
    except GeometryError as first_error:
        log.warning("Boolean %s: invalid input (%s), trying repair", op, first_error.detail)
        try:
            a, b = repair_mesh(a).mesh, repair_mesh(b).mesh
            solid_a, solid_b = to_manifold(a), to_manifold(b)
            repaired = True
        except GeometryError as exc:
            return _fail(
                f"{name.capitalize()} yapılamadı: girdi onarılamadı. {exc.user_message}",
                f"op={op} input invalid after repair: {exc.detail}",
            )

    try:
        result = _apply(solid_a, solid_b, op)
    except Exception as exc:  # manifold3d raises RuntimeError on internal failures
        return _fail(f"{name.capitalize()} işlemi başarısız oldu.", f"op={op} {exc!r}")

    vol_a, vol_b = solid_a.volume(), solid_b.volume()
    check = _verify(result, op, vol_a, vol_b)
    if check:
        return _fail(f"{name.capitalize()} sonucu güvenilir değil: {check[0]}", check[1])

    if result.is_empty():  # only reachable for an intersection: no overlap
        return BooleanResult(ok=True, mesh=trimesh.Trimesh(), repaired_inputs=repaired)
    mesh = from_manifold(result)
    if not mesh.is_watertight:
        return _fail(
            f"{name.capitalize()} sonucu kapalı (su geçirmez) değil.",
            f"op={op} result not watertight",
        )
    out = BooleanResult(ok=True, mesh=mesh, repaired_inputs=repaired)
    if repaired:
        out.warnings.append("Girdiler işlemden önce otomatik onarıldı.")
    log.info("Boolean %s ok: vol_a=%.4f vol_b=%.4f result=%.4f", op, vol_a, vol_b, result.volume())
    return out


def difference(a: trimesh.Trimesh, b: trimesh.Trimesh) -> BooleanResult:
    return boolean(a, b, BooleanOp.DIFFERENCE)


def union(a: trimesh.Trimesh, b: trimesh.Trimesh) -> BooleanResult:
    return boolean(a, b, BooleanOp.UNION)


def intersection(a: trimesh.Trimesh, b: trimesh.Trimesh) -> BooleanResult:
    return boolean(a, b, BooleanOp.INTERSECTION)


def union_meshes(meshes: Sequence[trimesh.Trimesh]) -> trimesh.Trimesh:
    """Union of several solids; raises GeometryError on failure."""
    if not meshes:
        raise GeometryError("Birleştirilecek geometri yok.", "empty union list")
    current = meshes[0]
    for other in meshes[1:]:
        current = union(current, other).unwrap()
    return current


def split_by_plane(
    mesh: trimesh.Trimesh, normal: Sequence[float], offset: float
) -> tuple[trimesh.Trimesh | None, trimesh.Trimesh | None]:
    """Cut with plane n·x = offset. Returns (positive side, negative side); None if empty."""
    n = np.asarray(normal, dtype=float)
    n = n / np.linalg.norm(n)
    positive, negative = to_manifold(mesh).split_by_plane(tuple(n), float(offset))
    return (
        None if positive.is_empty() else from_manifold(positive),
        None if negative.is_empty() else from_manifold(negative),
    )


def _apply(a: m3.Manifold, b: m3.Manifold, op: BooleanOp) -> m3.Manifold:
    if op is BooleanOp.UNION:
        return a + b
    if op is BooleanOp.DIFFERENCE:
        return a - b
    return a ^ b


def _verify(
    result: m3.Manifold, op: BooleanOp, vol_a: float, vol_b: float
) -> tuple[str, str] | None:
    """Return (Turkish reason, detail) if the result is implausible."""
    if result.status() != m3.Error.NoError:
        return "geçersiz geometri", f"status {result.status()}"
    vol = result.volume()
    tol = VOLUME_ABS_TOL + VOLUME_REL_TOL * (vol_a + vol_b)
    if op is BooleanOp.UNION:
        low, high = max(vol_a, vol_b), vol_a + vol_b
    elif op is BooleanOp.DIFFERENCE:
        low, high = max(vol_a - vol_b, 0.0), vol_a
    else:
        low, high = 0.0, min(vol_a, vol_b)
    if not (low - tol <= vol <= high + tol):
        return "hacim beklenen aralıkta değil", f"op={op} vol={vol} expected [{low}, {high}]"
    if result.is_empty() and op is not BooleanOp.INTERSECTION:
        return "sonuç boş", f"op={op} empty result"
    return None


def _fail(user_message: str, detail: str) -> BooleanResult:
    log.error("Boolean failed: %s | %s", user_message, detail)
    return BooleanResult(ok=False, user_message=user_message, detail=detail)
