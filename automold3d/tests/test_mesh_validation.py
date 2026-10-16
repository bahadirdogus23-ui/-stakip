import math
import time

import numpy as np
import pytest

from automold3d.core.importer import load_model
from automold3d.core.mesh_validation import (
    SELF_INTERSECTION_MAX_FACES,
    find_self_intersections,
    repair_mesh,
    validate_mesh,
)
from automold3d.tests import fixtures as fx


def test_cube_report():
    report = validate_mesh(fx.cube(30.0))
    assert report.dimensions == pytest.approx((30, 30, 30))
    assert report.is_watertight and report.is_winding_consistent
    assert report.volume == pytest.approx(27000)
    assert report.component_count == 1
    assert report.self_intersecting is False
    assert report.is_valid_solid


def test_sphere_volume_close_to_analytic():
    report = validate_mesh(fx.sphere(20.0, subdivisions=5))
    assert report.volume == pytest.approx(4 / 3 * math.pi * 20**3, rel=0.01)
    assert report.is_valid_solid


def test_cylinder_dims():
    report = validate_mesh(fx.cyl(10.0, 40.0))
    assert report.dimensions == pytest.approx((20, 20, 40), abs=1e-6)
    assert report.is_valid_solid


@pytest.mark.parametrize("mesh_fn", [fx.ring_torus, fx.tube])
def test_genus_shapes_valid(mesh_fn):
    assert validate_mesh(mesh_fn()).is_valid_solid


def test_multi_component():
    report = validate_mesh(fx.two_cubes())
    assert report.component_count == 2
    assert report.is_watertight
    assert any("2 ayrı parça" in m for m in report.messages)


def test_open_edges_not_watertight_and_no_volume():
    report = validate_mesh(fx.open_box())
    assert not report.is_watertight
    assert report.open_edge_count == 4
    assert report.volume is None
    assert not report.is_valid_solid
    assert any("su geçirmez" in m for m in report.messages)


def test_inverted_normals_detected_and_repaired():
    mesh = fx.inverted_cube()
    report = validate_mesh(mesh)
    assert report.normals_inverted
    repaired = repair_mesh(mesh)
    assert validate_mesh(repaired.mesh).is_valid_solid
    assert validate_mesh(mesh).normals_inverted  # original untouched


def test_repair_fills_hole():
    mesh = fx.open_box()
    result = repair_mesh(mesh)
    assert result.mesh.is_watertight
    assert result.mesh.volume == pytest.approx(27000)
    assert not mesh.is_watertight
    assert any("Delik" in a for a in result.actions)


def test_repair_removes_degenerate_and_duplicate_faces():
    mesh = fx.cube()
    faces = np.vstack([mesh.faces, mesh.faces[:2], [[0, 0, 1]]])
    broken = mesh.copy()
    broken.faces = faces
    report = validate_mesh(broken, check_self_intersection=False)
    assert report.duplicate_face_count == 2
    assert report.degenerate_face_count == 1
    fixed = repair_mesh(broken).mesh
    assert len(fixed.faces) == 12
    assert validate_mesh(fixed).is_valid_solid


def test_self_intersection_detected():
    assert find_self_intersections(fx.overlapping_cubes()) is True
    assert find_self_intersections(fx.two_cubes()) is False
    assert find_self_intersections(fx.sphere()) is False
    assert find_self_intersections(fx.ring_torus()) is False


def test_high_poly_validation(tmp_path):
    mesh = fx.high_poly_sphere()
    assert 450_000 <= len(mesh.faces) <= SELF_INTERSECTION_MAX_FACES
    path = fx.write_mesh(mesh, tmp_path / "hp.stl")
    start = time.perf_counter()
    result = load_model(path)
    report = validate_mesh(result.mesh)
    elapsed = time.perf_counter() - start
    assert report.face_count == len(mesh.faces)
    assert report.is_watertight
    assert report.self_intersecting is False
    assert report.dimensions == pytest.approx((80, 80, 80), abs=1e-3)
    assert elapsed < 60
