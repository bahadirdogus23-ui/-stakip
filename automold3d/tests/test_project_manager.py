import json

import pytest

from automold3d.core import pipeline
from automold3d.core.params import BodyShape, CastMode, MoldParams, PartingPlane
from automold3d.core.project_manager import (
    History,
    ProjectError,
    ProjectState,
    RecentProjects,
    Session,
    load_project,
    save_project,
)
from automold3d.tests import fixtures as fx


def test_save_load_roundtrip(tmp_path):
    state = ProjectState(
        cast_mode=CastMode.CAST_INTO_MOLD,
        source_path="/x/model.stl",
        mold=MoldParams(body_shape=BodyShape.BOX, box_size=(80, 70, 60), shrinkage_percent=1.5),
        mode="A",
        pull_dir=(1.0, 0.0, 0.0),
        opening_offset=12.5,
        plane=PartingPlane((0.0, 1.0, 0.0), -3.0),
        pin_positions=[(1.0, 2.0), (3.0, 4.0)],
        planes=[PartingPlane((0.0, 0.0, 1.0), -24.0), PartingPlane((1.0, 0.0, 0.0), 2.0)],
        n_parts_target=4,
    )
    path = save_project(state, tmp_path / "proje")
    assert path.suffix == ".amproj"
    assert load_project(path) == state


def test_load_rejects_other_files(tmp_path):
    bad = tmp_path / "x.amproj"
    bad.write_text(json.dumps({"hello": 1}))
    with pytest.raises(ProjectError, match="AutoMold"):
        load_project(bad)
    bad.write_text("{not json")
    with pytest.raises(ProjectError, match="bozuk"):
        load_project(bad)
    with pytest.raises(ProjectError, match="bulunamadı"):
        load_project(tmp_path / "missing.amproj")


def test_recent_projects_order_and_limit(tmp_path):
    recent = RecentProjects(tmp_path / "recent.sqlite")
    files = []
    for i in range(12):
        f = tmp_path / f"p{i}.amproj"
        f.write_text("{}")
        recent.add(f)
        files.append(f.resolve())
    listed = recent.list()
    assert listed[0] == files[-1]
    assert len(listed) == 10
    files[-1].unlink()
    assert files[-1] not in recent.list()
    recent.add(files[3])
    assert recent.list()[0] == files[3]


def test_history_undo_redo():
    history = History(Session(label="start"))
    a = history.current.snapshot("a")
    history.push(a)
    b = a.snapshot("b")
    b.state.mode = "A"
    history.push(b)
    assert history.undo_label == "b"
    assert history.undo() is a and a.state.mode == "B"
    assert history.redo() is b
    history.undo()
    history.push(a.snapshot("c"))
    assert not history.can_redo()
    with pytest.raises(ProjectError):
        History(Session()).undo()


def test_pipeline_full_flow(tmp_path):
    path = fx.write_mesh(fx.sphere(2.0), tmp_path / "s.stl")
    session = pipeline.import_model(path, "cm")
    assert session.model.extents == pytest.approx([40, 40, 40], rel=1e-3)
    assert session.validation.is_watertight
    analysis = pipeline.analyze(session)
    assert analysis.suggestions
    assert analysis.session.validation.self_intersecting is False
    mold = pipeline.build_mold(analysis.session)
    assert mold.mold is not None and mold.split is None
    parts = pipeline.split(mold, with_pins=True)
    assert len(parts.split.parts) == 2 and parts.split.pins is not None
    report, files = pipeline.export(
        parts, tmp_path / "out", ["stl"], overwrite=False, snapshot=False
    )
    assert report["kaynak"]["sha256"] == session.state.source_sha256
    assert len(files) == 2
    assert session.mold is None  # earlier sessions untouched


def test_pipeline_mode_a_and_repair(tmp_path):
    path = fx.write_mesh(fx.open_box(), tmp_path / "o.stl")
    session = pipeline.import_model(path, "mm")
    assert not session.validation.is_watertight
    fixed = pipeline.repair(session)
    assert fixed.validation.is_watertight and fixed.state.repaired
    fixed.state.mode = "A"
    built = pipeline.build_mold(fixed)
    assert built.split is not None and built.split.mode == "A"
    with pytest.raises(Exception, match="Mod B"):
        pipeline.split(built)


def test_pipeline_mode_c(tmp_path):
    path = fx.write_mesh(fx.inverted_mushroom(), tmp_path / "m.stl")
    session = pipeline.import_model(path, "mm")
    session.state.mode = "C"
    suggested, auto = pipeline.suggest_planes(session)
    assert auto.success and suggested.state.planes
    suggested.state.planes = [
        PartingPlane((0.0, 0.0, 1.0), -24.0),
        PartingPlane((0.0, 0.0, 1.0), -10.0),
    ]
    parts = pipeline.split(pipeline.build_mold(suggested), with_pins=True)
    assert len(parts.split.parts) == 3
    report, _ = pipeline.export(parts, tmp_path / "out", ["stl"], overwrite=False, snapshot=False)
    assert sorted(report["montaj_sirasi"]) == [1, 2, 3]
    assert len(report["parca_bilgisi"]) == 3
