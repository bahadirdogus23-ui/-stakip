import pytest

from automold3d.core import geometry_checks as qa
from automold3d.core.boolean_engine import union_meshes
from automold3d.core.demold_analysis import analyze_n_part, auto_parting_planes
from automold3d.core.errors import GeometryError
from automold3d.core.mold_generator import generate_mold
from automold3d.core.params import MoldParams, PartingPlane, PinParams
from automold3d.core.splitter import MoldPart, check_interference, n_part
from automold3d.tests import fixtures as fx

Z = (0.0, 0.0, 1.0)


def _check(result, prefix):
    return [c for c in result.checks if c.name.startswith(prefix)]


@pytest.fixture(scope="module")
def mushroom_mold():
    # The inverted mushroom is the undercut fixture (cap at the bottom, z -28..-20).
    return generate_mold(fx.inverted_mushroom(), MoldParams())


def test_three_part_undercut_fixture(mushroom_mold):
    planes = [PartingPlane(Z, -24.0), PartingPlane(Z, -10.0)]
    result = n_part(mushroom_mold, planes, MoldParams())
    assert result.mode == "C"
    assert len(result.parts) == 3
    assert sorted(p.part_id for p in result.parts) == [1, 2, 3]
    assert len({p.name for p in result.parts}) == 3
    reunion = union_meshes([p.mesh for p in result.parts])
    assert reunion.volume == pytest.approx(mushroom_mold.mold.volume, rel=1e-6)
    assert _check(result, "Parçalar arası çakışma")[0].status is qa.CheckStatus.PASSED
    demold = _check(result, "Parça ")
    assert all(c.status is qa.CheckStatus.PASSED for c in demold if "kalıptan çıkma" in c.name)
    assert sorted(result.assembly_order) == [1, 2, 3]
    assert _check(result, "Montaj sırası")[0].status is qa.CheckStatus.MANUAL
    assert not qa.all_passed(result.checks)  # assembly order always needs a human look


def test_three_part_with_pins(mushroom_mold):
    planes = [PartingPlane(Z, -24.0), PartingPlane(Z, -10.0)]
    result = n_part(mushroom_mold, planes, MoldParams(), PinParams(count=4))
    pins = _check(result, "Pim/yuva")[0]
    assert pins.status is qa.CheckStatus.PASSED, pins.message
    assert len(result.pins.pins) == 8
    assert _check(result, "Parçalar arası çakışma")[0].status is qa.CheckStatus.PASSED
    assert all(p.mesh.is_watertight for p in result.parts)


def test_crossing_planes_make_four_parts_and_reject_straddling_pins(mushroom_mold):
    planes = [PartingPlane(Z, -24.0), PartingPlane((1.0, 0.0, 0.0), 0.0)]
    result = n_part(mushroom_mold, planes, MoldParams(), PinParams(count=4))
    assert len(result.parts) == 4
    assert _check(result, "Parçalar arası çakışma")[0].status is qa.CheckStatus.PASSED
    reasons = {p.reason for p in result.pins.placements if not p.valid}
    assert all(r for r in reasons)


def test_interference_is_detected():
    a = MoldPart(1, "a", fx.cube(20.0))
    moved = fx.cube(20.0)
    moved.apply_translation((10, 0, 0))
    b = MoldPart(2, "b", moved)
    check = check_interference([a, b])
    assert check.status is qa.CheckStatus.ERROR
    assert "1-2" in check.message


def test_plane_missing_model_is_rejected(mushroom_mold):
    with pytest.raises(GeometryError, match="kesmiyor"):
        n_part(mushroom_mold, [PartingPlane(Z, 50.0)], MoldParams())
    with pytest.raises(GeometryError, match="en az bir"):
        n_part(mushroom_mold, [], MoldParams())


def test_cells_pick_free_directions():
    cells = analyze_n_part(fx.inverted_mushroom(), [PartingPlane(Z, -24.0)])
    assert {c.pull_dir for c in cells} == {(0.0, 0.0, 1.0), (0.0, 0.0, -1.0)}
    assert all(c.undercut_area == 0 for c in cells)


def test_auto_planes_success():
    result = auto_parting_planes(fx.mushroom(), max_parts=3)
    assert result.success
    assert result.undercut_area == 0
    assert 1 <= len(result.planes) <= 2


def test_auto_planes_graceful_failure():
    result = auto_parting_planes(fx.hollow_sphere(), max_parts=3)
    assert not result.success
    assert "elle" in result.message
    assert result.undercut_area > 0
