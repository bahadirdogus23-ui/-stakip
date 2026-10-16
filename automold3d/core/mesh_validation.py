"""Mesh validation and repair. Never mutates the mesh it is given."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import trimesh
from scipy.spatial import cKDTree

log = logging.getLogger(__name__)

# Self-intersection test limits: above these the check is skipped (reported as None).
SELF_INTERSECTION_MAX_FACES = 600_000
SELF_INTERSECTION_MAX_PAIRS = 20_000_000
_PAIR_CHUNK = 500_000
_EPS = 1e-9


@dataclass
class ValidationReport:
    """Facts about a mesh. `volume` is None when it cannot be computed reliably."""

    face_count: int
    vertex_count: int
    bounds_min: tuple[float, float, float]
    bounds_max: tuple[float, float, float]
    dimensions: tuple[float, float, float]
    is_watertight: bool
    is_winding_consistent: bool
    normals_inverted: bool
    volume: float | None
    surface_area: float
    component_count: int
    degenerate_face_count: int
    duplicate_face_count: int
    open_edge_count: int
    non_manifold_edge_count: int
    self_intersecting: bool | None
    messages: list[str] = field(default_factory=list)

    @property
    def is_valid_solid(self) -> bool:
        return (
            self.is_watertight
            and self.is_winding_consistent
            and not self.normals_inverted
            and self.volume is not None
            and self.volume > 0
            and self.degenerate_face_count == 0
            and self.self_intersecting is False
        )


@dataclass
class RepairResult:
    mesh: trimesh.Trimesh
    actions: list[str]


def validate_mesh(mesh: trimesh.Trimesh, check_self_intersection: bool = True) -> ValidationReport:
    """Compute validation facts and Turkish summary messages."""
    edges_sorted = np.sort(mesh.edges, axis=1)
    _, edge_counts = np.unique(edges_sorted, axis=0, return_counts=True)
    open_edges = int(np.count_nonzero(edge_counts == 1))
    non_manifold_edges = int(np.count_nonzero(edge_counts > 2))

    watertight = bool(mesh.is_watertight)
    winding = bool(mesh.is_winding_consistent)
    signed_volume = float(mesh.volume) if watertight and winding else None
    inverted = signed_volume is not None and signed_volume < 0
    volume = abs(signed_volume) if signed_volume is not None else None

    self_intersecting = None
    if check_self_intersection:
        self_intersecting = find_self_intersections(mesh)

    bounds = np.asarray(mesh.bounds, dtype=float)
    report = ValidationReport(
        face_count=len(mesh.faces),
        vertex_count=len(mesh.vertices),
        bounds_min=_triple(bounds[0]),
        bounds_max=_triple(bounds[1]),
        dimensions=_triple(bounds[1] - bounds[0]),
        is_watertight=watertight,
        is_winding_consistent=winding,
        normals_inverted=inverted,
        volume=volume,
        surface_area=float(mesh.area),
        component_count=count_components(mesh),
        degenerate_face_count=int(np.count_nonzero(~mesh.nondegenerate_faces(height=_EPS))),
        duplicate_face_count=len(mesh.faces)
        - len(trimesh.grouping.unique_rows(np.sort(mesh.faces, axis=1))[0]),
        open_edge_count=open_edges,
        non_manifold_edge_count=non_manifold_edges,
        self_intersecting=self_intersecting,
    )
    report.messages = _messages(report)
    return report


def count_components(mesh: trimesh.Trimesh) -> int:
    """Number of face-connected components (shared vertices count as connected)."""
    if len(mesh.faces) == 0:
        return 0
    labels = trimesh.graph.connected_component_labels(
        mesh.face_adjacency, node_count=len(mesh.faces)
    )
    return int(len(np.unique(labels)))


def repair_mesh(mesh: trimesh.Trimesh) -> RepairResult:
    """Return a repaired copy plus a Turkish list of what was changed."""
    fixed = mesh.copy()
    actions: list[str] = []

    before = len(fixed.vertices)
    fixed.merge_vertices()
    if len(fixed.vertices) != before:
        actions.append(f"{before - len(fixed.vertices)} çift köşe birleştirildi.")

    keep = fixed.nondegenerate_faces(height=_EPS)
    if not keep.all():
        fixed.update_faces(keep)
        actions.append(f"{int(np.count_nonzero(~keep))} dejenere üçgen silindi.")

    unique = trimesh.grouping.unique_rows(np.sort(fixed.faces, axis=1))[0]
    if len(unique) != len(fixed.faces):
        removed = len(fixed.faces) - len(unique)
        mask = np.zeros(len(fixed.faces), dtype=bool)
        mask[unique] = True
        fixed.update_faces(mask)
        actions.append(f"{removed} tekrarlanan üçgen silindi.")
    fixed.remove_unreferenced_vertices()

    if not fixed.is_watertight:
        open_before = _open_edge_count(fixed)
        trimesh.repair.fill_holes(fixed)
        open_after = _open_edge_count(fixed)
        if open_after < open_before:
            actions.append(f"Delikler dolduruldu (açık kenar {open_before} → {open_after}).")

    was_consistent = fixed.is_winding_consistent
    volume_before = fixed.volume if fixed.is_watertight else None
    trimesh.repair.fix_normals(fixed)
    if not was_consistent and fixed.is_winding_consistent:
        actions.append("Yüzey yönleri tutarlı hale getirildi.")
    elif volume_before is not None and volume_before < 0 < fixed.volume:
        actions.append("Ters dönmüş normaller düzeltildi.")

    if not actions:
        actions.append("Onarılacak sorun bulunmadı.")
    log.info("Repair actions: %s", actions)
    return RepairResult(mesh=fixed, actions=actions)


def find_self_intersections(mesh: trimesh.Trimesh) -> bool | None:
    """True if two non-adjacent triangles cross. None if the mesh is too big to check.

    Pairs sharing a vertex and exactly coplanar overlaps are not detected.
    """
    n_faces = len(mesh.faces)
    if n_faces > SELF_INTERSECTION_MAX_FACES:
        return None
    if n_faces < 2:
        return False
    pairs = _candidate_pairs(mesh)
    if pairs is None:
        return None
    triangles = np.asarray(mesh.triangles, dtype=float)
    faces = np.asarray(mesh.faces)
    for start in range(0, len(pairs), _PAIR_CHUNK):
        chunk = pairs[start : start + _PAIR_CHUNK]
        a, b = chunk[:, 0], chunk[:, 1]
        shares_vertex = (faces[a][:, :, None] == faces[b][:, None, :]).any(axis=(1, 2))
        a, b = a[~shares_vertex], b[~shares_vertex]
        if len(a) and _triangles_cross(triangles[a], triangles[b]).any():
            return True
    return False


def _candidate_pairs(mesh: trimesh.Trimesh) -> np.ndarray | None:
    """Triangle pairs whose bounding boxes overlap (i < j)."""
    triangles = np.asarray(mesh.triangles, dtype=float)
    lo, hi = triangles.min(axis=1), triangles.max(axis=1)
    center = (lo + hi) / 2
    radius = np.linalg.norm(hi - lo, axis=1) / 2
    big = radius > 4 * max(float(np.median(radius)), _EPS)
    small_idx, big_idx = np.flatnonzero(~big), np.flatnonzero(big)

    pair_sets: list[np.ndarray] = []
    if len(small_idx) > 1:
        tree = cKDTree(center[small_idx])
        r = 2 * float(radius[small_idx].max()) + _EPS
        pairs = tree.query_pairs(r, output_type="ndarray")
        if len(pairs) > SELF_INTERSECTION_MAX_PAIRS:
            return None
        pair_sets.append(small_idx[pairs])
    for i in big_idx:
        overlap = np.all((lo <= hi[i]) & (hi >= lo[i]), axis=1)
        overlap[i] = False
        others = np.flatnonzero(overlap)
        others = others[~big[others] | (others > i)]
        pair_sets.append(np.column_stack([np.full(len(others), i), others]))
    if not pair_sets:
        return np.empty((0, 2), dtype=int)
    pairs = np.sort(np.vstack(pair_sets), axis=1)
    overlap = np.all(
        (lo[pairs[:, 0]] <= hi[pairs[:, 1]]) & (hi[pairs[:, 0]] >= lo[pairs[:, 1]]), axis=1
    )
    return pairs[overlap]


def _triangles_cross(tri_a: np.ndarray, tri_b: np.ndarray) -> np.ndarray:
    """Vectorised test: does any edge of one triangle pierce the other's interior?"""
    hit = np.zeros(len(tri_a), dtype=bool)
    for first, second in ((tri_a, tri_b), (tri_b, tri_a)):
        for k in range(3):
            p0, p1 = first[:, k], first[:, (k + 1) % 3]
            hit |= _segment_hits_triangle(p0, p1, second)
    return hit


def _segment_hits_triangle(p0: np.ndarray, p1: np.ndarray, tri: np.ndarray) -> np.ndarray:
    """Möller–Trumbore with strict interior bounds so touching edges do not count."""
    direction = p1 - p0
    e1 = tri[:, 1] - tri[:, 0]
    e2 = tri[:, 2] - tri[:, 0]
    pvec = np.cross(direction, e2)
    det = np.einsum("ij,ij->i", e1, pvec)
    scale = (
        np.linalg.norm(e1, axis=1) * np.linalg.norm(e2, axis=1) * np.linalg.norm(direction, axis=1)
    )
    valid = np.abs(det) > 1e-12 * np.maximum(scale, _EPS)
    inv = np.where(valid, 1.0 / np.where(valid, det, 1.0), 0.0)
    tvec = p0 - tri[:, 0]
    u = np.einsum("ij,ij->i", tvec, pvec) * inv
    qvec = np.cross(tvec, e1)
    v = np.einsum("ij,ij->i", direction, qvec) * inv
    t = np.einsum("ij,ij->i", e2, qvec) * inv
    tol = 1e-7
    return valid & (u > tol) & (v > tol) & (u + v < 1 - tol) & (t > tol) & (t < 1 - tol)


def _open_edge_count(mesh: trimesh.Trimesh) -> int:
    _, counts = np.unique(np.sort(mesh.edges, axis=1), axis=0, return_counts=True)
    return int(np.count_nonzero(counts == 1))


def _triple(values: np.ndarray) -> tuple[float, float, float]:
    return (float(values[0]), float(values[1]), float(values[2]))


def _messages(report: ValidationReport) -> list[str]:
    msgs: list[str] = []
    if not report.is_watertight:
        msgs.append(
            f"Model su geçirmez (kapalı) değil: {report.open_edge_count} açık kenar. "
            "Hacim hesaplanamaz; devam etmeden önce onarım gerekir."
        )
    if not report.is_winding_consistent:
        msgs.append("Yüzey yönleri (normaller) tutarsız.")
    if report.normals_inverted:
        msgs.append("Normaller ters dönmüş (hacim negatif).")
    if report.non_manifold_edge_count:
        msgs.append(f"{report.non_manifold_edge_count} manifold olmayan kenar var.")
    if report.degenerate_face_count:
        msgs.append(f"{report.degenerate_face_count} dejenere (sıfır alanlı) üçgen var.")
    if report.duplicate_face_count:
        msgs.append(f"{report.duplicate_face_count} tekrarlanan üçgen var.")
    if report.component_count > 1:
        msgs.append(f"Model {report.component_count} ayrı parçadan oluşuyor.")
    if report.self_intersecting:
        msgs.append("Model kendi kendini kesiyor (iç içe geçen yüzeyler).")
    elif report.self_intersecting is None:
        msgs.append("Kendi kendini kesme kontrolü yapılmadı (model çok büyük); manuel inceleyin.")
    if not msgs:
        msgs.append("Model geçerli, kapalı bir katı.")
    return msgs
