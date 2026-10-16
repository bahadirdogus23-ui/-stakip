import pytest

from automold3d.core import geometry_checks as qa
from automold3d.core.errors import GeometryError
from automold3d.core.mold_generator import (
    ModelNotSolidError,
    generate_mold,
    preview_body,
)
from automold3d.core.params import BodyShape, CastMode, MoldParams
from automold3d.tests import fixtures as fx

SHAPES = [BodyShape.AUTO_BOX, BodyShape.CYLINDER]


def _status(result, name):
    return next(c for c in result.checks if c.name == name).status


@pytest.mark.parametrize("shape", SHAPES)
@pytest.mark.parametrize("model_fn", [fx.cube, fx.sphere])
def test_volume_balance_within_half_percent(shape, model_fn):
    model = model_fn()
    result = generate_mold(model, MoldParams(body_shape=shape))
    expected = result.body.volume - model.volume
    assert result.mold.volume == pytest.approx(expected, rel=0.005)
    assert result.mold.is_watertight
    assert qa.all_passed(result.checks), [(c.name, c.message) for c in result.checks]


def test_explicit_box_body():
    params = MoldParams(body_shape=BodyShape.BOX, box_size=(80, 70, 60))
    result = generate_mold(fx.sphere(20.0), params)
    assert result.outer_dimensions == pytest.approx((80, 70, 60))
    assert qa.all_passed(result.checks)


def test_box_too_small_rejected():
    params = MoldParams(body_shape=BodyShape.BOX, box_size=(30, 30, 30))
    with pytest.raises(GeometryError, match="içine almıyor"):
        generate_mold(fx.sphere(20.0), params)


def test_margins_produce_exact_outer_size():
    params = MoldParams(margin_side=7, margin_top=4, margin_bottom=9)
    result = generate_mold(fx.cube(30.0), params)
    assert result.outer_dimensions == pytest.approx((44, 44, 43))
    wall = next(c for c in result.checks if c.name == "Minimum duvar kalınlığı")
    assert wall.data["minimum"] == pytest.approx(4.0)


def test_thin_wall_warns():
    params = MoldParams(margin_side=10, margin_top=2, margin_bottom=10, min_wall_thickness=5)
    result = generate_mold(fx.cube(), params)
    assert _status(result, "Minimum duvar kalınlığı") is qa.CheckStatus.WARNING
    assert not qa.all_passed(result.checks)
    assert "DEĞİL" in qa.readiness_message(result.checks) or "sayılmaz" in qa.readiness_message(
        result.checks
    )


def test_cylinder_wall_uses_polygon_apothem():
    result = generate_mold(
        fx.cyl(10.0, 40.0), MoldParams(body_shape=BodyShape.CYLINDER, margin_side=8)
    )
    wall = next(c for c in result.checks if c.name == "Minimum duvar kalınlığı")
    assert wall.data["minimum"] == pytest.approx(8.0, abs=0.05)


def test_no_scaling_by_default():
    model = fx.cube(30.0)
    result = generate_mold(model, MoldParams())
    assert result.cavity_dimensions == pytest.approx(result.object_dimensions)
    assert result.object_dimensions == pytest.approx((30, 30, 30))


def test_shrinkage_scales_cavity_explicitly():
    model = fx.cube(30.0)
    result = generate_mold(model, MoldParams(shrinkage_percent=2.0))
    assert result.object_dimensions == pytest.approx((30, 30, 30))
    assert result.cavity_dimensions == pytest.approx((30.6, 30.6, 30.6))
    assert model.extents == pytest.approx((30, 30, 30))  # input untouched


def test_open_model_requires_user_decision():
    with pytest.raises(ModelNotSolidError, match="onarmak"):
        generate_mold(fx.open_box(), MoldParams())


def test_draft_angle_not_implemented():
    with pytest.raises(GeometryError, match="desteklenmiyor"):
        generate_mold(fx.cube(), MoldParams(draft_angle_deg=2.0))


def test_invalid_params():
    with pytest.raises(GeometryError, match="negatif"):
        generate_mold(fx.cube(), MoldParams(margin_side=-1))


def test_preview_body_matches_generated_body():
    params = MoldParams(body_shape=BodyShape.CYLINDER)
    preview = preview_body(fx.sphere(), params)
    result = generate_mold(fx.sphere(), params)
    assert preview.volume == pytest.approx(result.body.volume)


def test_torus_cavity_enclosed():
    result = generate_mold(fx.ring_torus(), MoldParams())
    assert qa.all_passed(result.checks)


def test_multi_component_model():
    model = fx.two_cubes()
    result = generate_mold(model, MoldParams())
    enclosed = next(c for c in result.checks if c.name == "Boşluk kapalı")
    assert enclosed.data["inner_shells"] == 2
    assert qa.all_passed(result.checks)


def test_cast_mode_defaults_differ():
    silicone = MoldParams.for_cast_mode(CastMode.SILICONE_MOLD)
    cast = MoldParams.for_cast_mode(CastMode.CAST_INTO_MOLD)
    assert silicone.margin_side != cast.margin_side
    assert silicone.shrinkage_percent == cast.shrinkage_percent == 0.0
