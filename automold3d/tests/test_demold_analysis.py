import numpy as np
import pytest

from automold3d.core.demold_analysis import (
    analyze_open_mold,
    analyze_two_part,
    suggest_parting_planes,
)
from automold3d.core.params import PartingPlane
from automold3d.tests import fixtures as fx


def test_upright_mushroom_open_mold_has_no_undercut():
    model = fx.mushroom()
    report = analyze_open_mold(model, (0, 0, 1), float(model.bounds[1][2]))
    assert not report.has_undercuts


def test_inverted_mushroom_open_mold_has_undercut():
    model = fx.inverted_mushroom()
    report = analyze_open_mold(model, (0, 0, 1), float(model.bounds[1][2]))
    assert report.has_undercuts
    # Blocked: the cap ring facing the opening, pi*(15^2 - 6^2), and the stem side, whose
    # surrounding mold material would run into that ring, 2*pi*6*20.
    expected = np.pi * (15**2 - 6**2) + 2 * np.pi * 6 * 20
    assert report.undercut_area == pytest.approx(expected, rel=0.02)


def test_sphere_open_mold_upper_half_is_undercut():
    model = fx.sphere(20.0)
    report = analyze_open_mold(model, (0, 0, 1), 20.0)
    assert report.has_undercuts
    assert 0.4 < report.undercut_fraction < 0.6


def test_sphere_two_part_at_equator_is_clean():
    report = analyze_two_part(fx.sphere(20.0), PartingPlane((0, 0, 1), 0.0))
    assert not report.has_undercuts


def test_sphere_two_part_off_centre_has_undercut():
    report = analyze_two_part(fx.sphere(20.0), PartingPlane((0, 0, 1), 10.0))
    assert report.has_undercuts


def test_torus_side_split_detects_hole_undercut():
    report = analyze_two_part(fx.ring_torus(), PartingPlane((1, 0, 0), 0.0))
    assert report.has_undercuts
    assert not analyze_two_part(fx.ring_torus(), PartingPlane((0, 0, 1), 0.0)).has_undercuts


def test_suggestion_for_sphere_is_equator():
    best = suggest_parting_planes(fx.sphere(20.0))[0]
    assert best.undercut_area == pytest.approx(0.0)
    assert abs(best.plane.offset) < 1.5


def test_suggestion_for_mushroom_is_through_the_cap():
    best = suggest_parting_planes(fx.mushroom())[0]
    assert best.undercut_area == pytest.approx(0.0)
    assert abs(abs(best.plane.normal[2]) - 1.0) < 1e-9
    offset = best.plane.offset * np.sign(best.plane.normal[2])
    assert 20.0 <= offset <= 28.0
    assert best.section_area == pytest.approx(np.pi * 15**2, rel=0.01)


def test_suggestion_uses_sampling_on_large_mesh():
    scores = suggest_parting_planes(fx.high_poly_sphere(), offsets_per_direction=11)
    best = scores[0]
    assert abs(best.plane.offset) < 5.0
    assert best.undercut_area < 0.01 * fx.high_poly_sphere().area
