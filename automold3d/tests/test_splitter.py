import numpy as np
import pytest

from automold3d.core import geometry_checks as qa
from automold3d.core.alignment import pin_solid
from automold3d.core.boolean_engine import intersection, union
from automold3d.core.errors import GeometryError
from automold3d.core.mold_generator import generate_mold
from automold3d.core.params import MoldParams, PartingPlane, PinParams
from automold3d.core.splitter import one_part_open, two_part
from automold3d.tests import fixtures as fx


def _overlap(a, b):
    mesh = intersection(a, b).unwrap()
    return float(mesh.volume) if len(mesh.faces) else 0.0


def _check(result, prefix):
    return next(c for c in result.checks if c.name.startswith(prefix))


# --------------------------------------------------------------- Mode A


def test_open_mold_upright_mushroom_passes():
    result = one_part_open(fx.mushroom(), MoldParams())
    assert len(result.parts) == 1
    assert qa.all_passed(result.checks), [(c.name, c.message) for c in result.checks]
    top = result.parts[0].mesh.bounds[1][2]
    assert top == pytest.approx(28.0)  # opening plane = model top, no top margin


def test_open_mold_inverted_mushroom_warns_undercut():
    result = one_part_open(fx.inverted_mushroom(), MoldParams())
    assert _check(result, "Ters açı").status is qa.CheckStatus.WARNING
    assert not qa.all_passed(result.checks)


def test_open_mold_sideways_pull_direction():
    model = fx.mushroom()
    model.apply_transform(np.array([[0, 0, 1, 0], [0, 1, 0, 0], [-1, 0, 0, 0], [0, 0, 0, 1.0]]))
    result = one_part_open(model, MoldParams(), pull_dir=(1, 0, 0))
    assert qa.all_passed(result.checks), [(c.name, c.message) for c in result.checks]
    assert result.parts[0].mesh.bounds[1][0] == pytest.approx(model.bounds[1][0])


def test_open_mold_partial_opening_volume():
    model = fx.sphere(20.0)
    result = one_part_open(model, MoldParams(), opening_offset=0.0)
    assert _check(result, "Negatif").status is qa.CheckStatus.PASSED
    assert not _check(result, "Ters açı").data["area"]


def test_open_mold_rejects_plane_outside_model():
    with pytest.raises(GeometryError, match="Açıklık"):
        one_part_open(fx.cube(), MoldParams(), opening_offset=100.0)


# --------------------------------------------------------------- Mode B


@pytest.fixture(scope="module")
def sphere_mold():
    return generate_mold(fx.sphere(20.0), MoldParams())


def test_two_halves_reunite_to_original(sphere_mold):
    result = two_part(sphere_mold, PartingPlane((0, 0, 1), 0.0), MoldParams())
    assert len(result.parts) == 2
    a, b = (p.mesh for p in result.parts)
    assert a.is_watertight and b.is_watertight
    reunion = union(a, b).unwrap()
    assert reunion.volume == pytest.approx(sphere_mold.mold.volume, rel=1e-6)
    assert qa.all_passed(result.checks), [(c.name, c.message) for c in result.checks]


def test_two_part_with_pins_clearance_is_exact(sphere_mold):
    pins = PinParams(diameter=5.0, length=5.0, clearance=0.2, count=4)
    plane = PartingPlane((0, 0, 1), 0.0)
    result = two_part(sphere_mold, plane, MoldParams(), pins)
    assert qa.all_passed(result.checks), [(c.name, c.message) for c in result.checks]
    layout = result.pins
    assert layout.valid_count == 4 and len(layout.pins) == 4
    socket_part = result.parts[1].mesh
    half_gap = pins.clearance / 2
    delta = 0.01
    for placement in layout.placements:
        fits = pin_solid(
            plane,
            placement.xy,
            pins.diameter / 2 + half_gap - delta,
            0.0,
            pins.length,
            pins.sections,
        )
        clashes = pin_solid(
            plane,
            placement.xy,
            pins.diameter / 2 + half_gap + delta,
            0.0,
            pins.length,
            pins.sections,
        )
        assert _overlap(fits, socket_part) == pytest.approx(0.0, abs=1e-9)
        assert _overlap(clashes, socket_part) > 1e-3


def test_pins_are_attached_and_sockets_cut(sphere_mold):
    pins = PinParams(count=4)
    no_pins = two_part(sphere_mold, PartingPlane((0, 0, 1), 0.0), MoldParams())
    with_pins = two_part(sphere_mold, PartingPlane((0, 0, 1), 0.0), MoldParams(), pins)
    pin_volume = with_pins.parts[0].mesh.volume - no_pins.parts[0].mesh.volume
    socket_volume = no_pins.parts[1].mesh.volume - with_pins.parts[1].mesh.volume
    r, rs = pins.diameter / 2, pins.socket_diameter / 2
    # Polygonal cylinders: area = n/2 r^2 sin(2pi/n).
    poly = 0.5 * pins.sections * np.sin(2 * np.pi / pins.sections)
    assert pin_volume == pytest.approx(4 * poly * r**2 * pins.length, rel=1e-3)
    assert socket_volume == pytest.approx(4 * poly * rs**2 * pins.socket_depth, rel=1e-3)


def test_manual_pin_inside_cavity_is_rejected(sphere_mold):
    pins = PinParams(count=0)
    result = two_part(
        sphere_mold,
        PartingPlane((0, 0, 1), 0.0),
        MoldParams(),
        pins,
        pin_positions=[(0.0, 0.0), (22.0, 22.0)],
    )
    placements = result.pins.placements
    assert not placements[0].valid and "boşluğuna" in placements[0].reason
    assert placements[1].valid
    assert _check(result, "Pim").status is qa.CheckStatus.WARNING


def test_manual_pin_too_close_to_outer_wall_is_rejected(sphere_mold):
    result = two_part(
        sphere_mold,
        PartingPlane((0, 0, 1), 0.0),
        MoldParams(),
        PinParams(count=0),
        pin_positions=[(29.0, 0.0)],
    )
    assert "dış duvar" in result.pins.placements[0].reason
    assert _check(result, "Pim").status is qa.CheckStatus.ERROR


def test_no_room_for_pins_is_an_error():
    mold = generate_mold(fx.cube(30.0), MoldParams(margin_side=3, min_wall_thickness=2))
    result = two_part(
        mold, PartingPlane((0, 0, 1), 0.0), MoldParams(min_wall_thickness=2), PinParams(count=4)
    )
    assert _check(result, "Pim").status is qa.CheckStatus.ERROR


def test_angled_plane_with_pins():
    mold = generate_mold(fx.sphere(20.0), MoldParams())
    plane = PartingPlane.from_angles(30.0, 60.0, 0.0)
    result = two_part(mold, plane, MoldParams(), PinParams(count=3))
    assert result.pins.valid_count == 3
    assert _check(result, "Parça sınırları").status is qa.CheckStatus.PASSED
    assert _check(result, "Pim").status is qa.CheckStatus.PASSED


def test_plane_must_cut_model(sphere_mold):
    with pytest.raises(GeometryError, match="kesmiyor"):
        two_part(sphere_mold, PartingPlane((0, 0, 1), 25.0), MoldParams())


def test_two_part_undercut_warning():
    mold = generate_mold(fx.mushroom(), MoldParams())
    result = two_part(mold, PartingPlane((0, 0, 1), 10.0), MoldParams())
    assert _check(result, "Ters açı").status is qa.CheckStatus.WARNING
