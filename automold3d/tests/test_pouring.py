import pytest

from automold3d.core import geometry_checks as qa
from automold3d.core import pipeline
from automold3d.core.mold_generator import generate_mold
from automold3d.core.params import MoldParams, PartingPlane, PinParams, PouringParams
from automold3d.core.pouring import air_trap_suggestions, apply_channels
from automold3d.core.splitter import two_part
from automold3d.tests import fixtures as fx


def _split(model, plane_z, pins=None):
    params = MoldParams()
    mold = generate_mold(model, params)
    return two_part(mold, PartingPlane((0, 0, 1), plane_z), params, pins)


def _channel_checks(result):
    return [c for c in result.checks if "bağlantısı" in c.name]


def test_off_by_default():
    params = PouringParams()
    assert not params.spout_enabled and not params.vents_enabled


def test_spout_at_top_of_sphere_is_connected():
    split = _split(fx.sphere(20.0), 0.0)
    result, pouring = apply_channels(split, PouringParams(spout_diameter=8.0), True, False)
    spout = pouring.channels[0]
    assert spout.kind == "spout"
    assert spout.position[2] == pytest.approx(20.0)
    assert [c.status for c in _channel_checks(result)] == [qa.CheckStatus.PASSED]
    removed = split.parts[1].mesh.volume - result.parts[1].mesh.volume
    assert removed > 0  # a real hole was cut into the top half
    assert result.parts[0].mesh.volume == pytest.approx(split.parts[0].mesh.volume)
    assert result.parts[1].mesh.is_watertight


def test_air_trap_suggestions_rank_local_maxima():
    model = fx.two_towers()
    suggestions = air_trap_suggestions(model, (0, 0, 1), min_spacing=6.0)
    heights = [round(s.height, 3) for s in suggestions]
    assert heights[:2] == [25.0, 20.0]
    assert suggestions[0].point[0] == pytest.approx(-10, abs=5.01)
    assert suggestions[1].point[0] == pytest.approx(10, abs=5.01)


def test_spout_and_vent_on_two_towers():
    split = _split(fx.two_towers(), 2.5)
    params = PouringParams(spout_diameter=6.0, vent_diameter=2.0, vent_count=1)
    result, pouring = apply_channels(split, params, True, True)
    kinds = [c.kind for c in pouring.channels]
    assert kinds == ["spout", "vent"]
    assert pouring.channels[0].position[2] == pytest.approx(25.0)
    assert pouring.channels[1].position[2] == pytest.approx(20.0)
    assert all(c.status is qa.CheckStatus.PASSED for c in _channel_checks(result))
    assert all(p.mesh.is_watertight for p in result.parts)


def test_disconnected_vent_is_error():
    split = _split(fx.sphere(20.0), 0.0)
    # (0, 18, 10) lies in mold material, outside the r=20 sphere.
    params = PouringParams(vent_positions=[(0.0, 18.0, 10.0)])
    result, _ = apply_channels(split, params, False, True)
    statuses = [c.status for c in _channel_checks(result)]
    assert statuses == [qa.CheckStatus.ERROR]
    assert "bağlantısız" in _channel_checks(result)[0].message
    assert not qa.all_passed(result.checks)


def test_spout_in_mode_b_with_pins_reports_no_clash():
    split = _split(fx.sphere(20.0), 0.0, PinParams(count=4))
    result, _ = apply_channels(split, PouringParams(), True, True)
    clash = next(c for c in result.checks if c.name == "Kanal/pim çakışması")
    assert clash.status is qa.CheckStatus.PASSED


def test_pipeline_channels_survive_resplit_and_undo(tmp_path):
    path = fx.write_mesh(fx.sphere(20.0), tmp_path / "s.stl")
    session = pipeline.build_mold(pipeline.import_model(path, "mm"))
    split = pipeline.split(session, with_pins=True)
    assert split.split.channels == []
    spout = pipeline.add_channels(split, spout=True)
    assert [c.kind for c in spout.split.channels] == ["spout"]
    both = pipeline.add_channels(spout, vents=True)
    assert both.state.pouring.spout_enabled and both.state.pouring.vents_enabled
    resplit = pipeline.split(both, with_pins=True)  # pins re-run keeps enabled channels
    assert {c.kind for c in resplit.split.channels} == {c.kind for c in both.split.channels}
    assert split.split.channels == []  # older session untouched
    report, _ = pipeline.export(resplit, tmp_path / "out", ["stl"], overwrite=False, snapshot=False)
    assert report["kanallar"][0]["tur"] == "dokum_agzi"
    assert all(t["not"] == "öneri" for t in report["hava_kapani_onerileri"])


def test_mode_a_vents():
    path_model = fx.two_towers()
    from automold3d.core.splitter import one_part_open

    split = one_part_open(path_model, MoldParams(), (0, 0, -1))  # towers point down
    result, pouring = apply_channels(
        split, PouringParams(pour_dir=(0, 0, -1), vent_count=2), False, True
    )
    assert pouring.channels
    assert all(c.status is qa.CheckStatus.PASSED for c in _channel_checks(result))
