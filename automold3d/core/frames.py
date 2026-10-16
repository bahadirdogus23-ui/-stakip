"""Rigid frames: rotate a direction onto +Z so plane/pull logic can work in z only."""

from __future__ import annotations

import numpy as np
import trimesh


def unit(vector: tuple[float, float, float] | np.ndarray) -> np.ndarray:
    v = np.asarray(vector, dtype=float)
    norm = np.linalg.norm(v)
    if norm == 0:
        raise ValueError("zero-length direction")
    return v / norm


def align_to_z(direction: tuple[float, float, float] | np.ndarray) -> np.ndarray:
    """4x4 rotation (no translation) taking `direction` to +Z, so d·x becomes z."""
    return trimesh.geometry.align_vectors(unit(direction), np.array([0.0, 0.0, 1.0]))


def as_3x4(matrix: np.ndarray) -> np.ndarray:
    """manifold3d transform format."""
    return np.ascontiguousarray(np.asarray(matrix, dtype=float)[:3, :4])


def transformed(mesh: trimesh.Trimesh, matrix: np.ndarray) -> trimesh.Trimesh:
    out = mesh.copy()
    out.apply_transform(matrix)
    return out
