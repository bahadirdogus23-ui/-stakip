"""Programmatic test meshes. All dimensions in mm."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import trimesh
from trimesh.creation import annulus, box, cylinder, icosphere, torus, uv_sphere


def cube(size: float = 30.0) -> trimesh.Trimesh:
    return box(extents=(size, size, size))


def sphere(radius: float = 20.0, subdivisions: int = 4) -> trimesh.Trimesh:
    return icosphere(subdivisions=subdivisions, radius=radius)


def cyl(radius: float = 10.0, height: float = 40.0) -> trimesh.Trimesh:
    return cylinder(radius=radius, height=height, sections=64)


def ring_torus(major: float = 20.0, minor: float = 6.0) -> trimesh.Trimesh:
    return torus(major_radius=major, minor_radius=minor, major_sections=64, minor_sections=32)


def tube(outer: float = 15.0, inner: float = 8.0, height: float = 20.0) -> trimesh.Trimesh:
    return annulus(r_min=inner, r_max=outer, height=height, sections=64)


def two_cubes(gap: float = 10.0, size: float = 20.0) -> trimesh.Trimesh:
    """Two separate cubes in one mesh (multi-component)."""
    first = box(extents=(size, size, size))
    second = box(extents=(size, size, size))
    second.apply_translation((size + gap, 0, 0))
    return trimesh.util.concatenate([first, second])


def overlapping_cubes(size: float = 20.0) -> trimesh.Trimesh:
    """Two cubes that interpenetrate but are not unioned: a self-intersecting mesh."""
    first = box(extents=(size, size, size))
    second = box(extents=(size, size, size))
    second.apply_translation((size / 2, size / 3, size / 4))
    return trimesh.util.concatenate([first, second])


def open_box(size: float = 30.0) -> trimesh.Trimesh:
    """A cube with its two top triangles removed (open edges, not watertight)."""
    mesh = box(extents=(size, size, size))
    normals = mesh.face_normals
    keep = ~np.isclose(normals[:, 2], 1.0)
    mesh.update_faces(keep)
    mesh.remove_unreferenced_vertices()
    return mesh


def inverted_cube(size: float = 30.0) -> trimesh.Trimesh:
    mesh = box(extents=(size, size, size))
    mesh.invert()
    return mesh


def high_poly_sphere(radius: float = 40.0) -> trimesh.Trimesh:
    """About 500k triangles."""
    return uv_sphere(radius=radius, count=(355, 355))


def write_mesh(mesh: trimesh.Trimesh, path: Path, file_type: str | None = None) -> Path:
    """Write a mesh; file_type 'stl_ascii' writes ASCII STL."""
    data = mesh.export(file_type=file_type or path.suffix.lstrip(".").lower())
    if isinstance(data, str):
        path.write_text(data, encoding="utf-8")
    else:
        path.write_bytes(data)
    return path


def write_broken_stl(path: Path) -> Path:
    """Binary STL header that promises more triangles than the file contains."""
    header = b"broken".ljust(80, b"\0")
    count = np.uint32(1000).tobytes()
    path.write_bytes(header + count + b"\x00" * 50)
    return path
