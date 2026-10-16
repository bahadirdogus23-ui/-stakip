import numpy as np
import pytest
import trimesh

from automold3d.core.boolean_engine import (
    difference,
    intersection,
    split_by_plane,
    union,
    union_meshes,
)
from automold3d.core.errors import GeometryError
from automold3d.tests import fixtures as fx


def test_difference_cube_minus_sphere():
    body = fx.cube(60.0)
    ball = fx.sphere(20.0)
    result = difference(body, ball)
    assert result.ok
    assert result.mesh.is_watertight
    assert result.mesh.volume == pytest.approx(body.volume - ball.volume, rel=1e-9)


def test_union_and_intersection_volumes():
    a = fx.cube(20.0)
    b = fx.cube(20.0)
    b.apply_translation((10, 0, 0))
    assert union(a, b).mesh.volume == pytest.approx(20 * 20 * 30)
    assert intersection(a, b).mesh.volume == pytest.approx(10 * 20 * 20)


def test_disjoint_intersection_is_empty_but_ok():
    a = fx.cube(10.0)
    b = fx.cube(10.0)
    b.apply_translation((50, 0, 0))
    result = intersection(a, b)
    assert result.ok and len(result.mesh.faces) == 0


def test_open_input_is_repaired_then_used():
    result = difference(fx.cube(60.0), fx.open_box(30.0))
    assert result.ok
    assert result.repaired_inputs
    assert result.warnings
    assert result.mesh.volume == pytest.approx(60**3 - 30**3, rel=1e-9)


def test_unrepairable_input_returns_structured_error():
    garbage = trimesh.Trimesh(
        vertices=[[0, 0, 0], [1, 0, 0], [0, 1, 0], [5, 5, 5]],
        faces=[[0, 1, 2], [0, 1, 3]],
        process=False,
    )
    result = difference(fx.cube(), garbage)
    assert not result.ok
    assert result.mesh is None
    assert "yapılamadı" in result.user_message
    with pytest.raises(GeometryError):
        result.unwrap()


def test_union_meshes_multiple():
    parts = [fx.cube(10.0) for _ in range(3)]
    for i, p in enumerate(parts):
        p.apply_translation((i * 5, 0, 0))
    assert union_meshes(parts).volume == pytest.approx(20 * 10 * 10)


def test_split_by_plane_halves():
    top, bottom = split_by_plane(fx.cube(20.0), (0, 0, 1), 0.0)
    assert top.volume == pytest.approx(4000)
    assert bottom.volume == pytest.approx(4000)
    assert top.bounds[0][2] == pytest.approx(0) and bottom.bounds[1][2] == pytest.approx(0)
    above, below = split_by_plane(fx.cube(20.0), (0, 0, 1), 50.0)
    assert above is None and below is not None
    np.testing.assert_allclose(below.extents, [20, 20, 20])
