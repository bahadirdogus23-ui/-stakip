import time

import pytest
from PySide6.QtCore import QTimer

from automold3d.core import geometry_checks as qa
from automold3d.core.exporter import REPORT_NAME
from automold3d.core.project_manager import RecentProjects
from automold3d.tests import fixtures as fx
from automold3d.ui.prompts import ExportOptions, Prompter

pytestmark = pytest.mark.gui
TIMEOUT = 120_000


class AutoPrompter(Prompter):
    """Answers every dialog like a user would, and records what was asked."""

    def __init__(self, parent):
        super().__init__(parent)
        self.unit = "mm"
        self.repair = True
        self.confirm_answer = True
        self.export = None
        self.save_path = None
        self.errors = []
        self.infos = []

    def ask_unit(self, detected, warnings):
        return self.unit

    def confirm_repair(self, messages):
        return self.repair

    def confirm(self, title, text):
        return self.confirm_answer

    def export_options(self):
        return self.export

    def save_project_path(self):
        return self.save_path

    def error(self, title, text):
        self.errors.append((title, text))

    def info(self, title, text):
        self.infos.append((title, text))


@pytest.fixture
def window(qtbot, tmp_path):
    from automold3d.ui.main_window import MainWindow

    win = MainWindow(
        prompter_factory=AutoPrompter, recent=RecentProjects(tmp_path / "recent.sqlite")
    )
    qtbot.addWidget(win)
    win.show()
    qtbot.waitExposed(win)
    yield win
    win.close()


def wait_idle(qtbot, win):
    qtbot.waitUntil(lambda: not win.runner.busy, timeout=TIMEOUT)


def import_file(qtbot, win, path):
    win.import_model_file(path)
    qtbot.waitUntil(lambda: win.session.model is not None and not win.runner.busy, timeout=TIMEOUT)


def test_main_window_opens(window):
    assert window.isVisible()
    assert window.windowTitle().startswith("AutoMold 3D")


def test_turkish_menus_present(window):
    titles = [a.text() for a in window.menuBar().actions()]
    assert titles == ["Dosya", "Düzenle", "Model", "Kalıp", "Görünüm", "Araçlar", "Yardım"]


def test_initial_actions(window):
    actions = window.toolbar_actions
    assert len(actions) == 10
    assert actions["Model İçe Aktar"].isEnabled()
    for label in ("Negatif Kalıp Oluştur", "Kalıbı Böl", "Dışa Aktar"):
        assert not actions[label].isEnabled()


def test_message_tabs(window):
    tabs = [window.message_tabs.tabText(i) for i in range(window.message_tabs.count())]
    assert tabs == ["Durum", "Uyarılar", "Hatalar", "Kontroller"]


def test_full_two_part_workflow(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.sphere(20.0), tmp_path / "kure.stl"))
    assert window.panel.dim_object.text() == "40.00 × 40.00 × 40.00"
    assert window.toolbar_actions["Negatif Kalıp Oluştur"].isEnabled()

    window.on_analyze()
    wait_idle(qtbot, window)
    assert "Öneri" in window.panel.suggestion_label.text()

    window.on_generate()
    wait_idle(qtbot, window)
    assert window.session.mold is not None
    assert qa.all_passed(window.session.mold.checks)

    window.on_pins()
    wait_idle(qtbot, window)
    split = window.session.split
    assert split is not None and len(split.parts) == 2 and len(split.pins.pins) == 4
    assert window.check_table.rowCount() == len(split.checks)

    window.prompts.export = ExportOptions(tmp_path / "out", ["stl"], snapshot=False)
    window.on_export()
    wait_idle(qtbot, window)
    assert (tmp_path / "out" / "kalip_parca_1_mm.stl").exists()
    assert (tmp_path / "out" / REPORT_NAME).exists()

    # Export again: asks to overwrite; "no" leaves the files alone.
    window.prompts.confirm_answer = False
    stamp = (tmp_path / "out" / REPORT_NAME).stat().st_mtime_ns
    window.on_export()
    wait_idle(qtbot, window)
    assert (tmp_path / "out" / REPORT_NAME).stat().st_mtime_ns == stamp


def test_undo_redo_operations(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.cube(30.0), tmp_path / "kup.stl"))
    window.on_generate()
    wait_idle(qtbot, window)
    window.on_split()
    wait_idle(qtbot, window)
    assert window.session.split is not None
    window.on_undo()
    assert window.session.split is None and window.session.mold is not None
    window.on_undo()
    assert window.session.mold is None and window.session.model is not None
    window.on_redo()
    window.on_redo()
    assert window.session.split is not None
    assert window.toolbar_actions["Dışa Aktar"].isEnabled()


def test_parameter_change_invalidates_and_is_undoable(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.cube(30.0), tmp_path / "kup.stl"))
    window.on_generate()
    wait_idle(qtbot, window)
    window.panel.margin_side.setValue(15.0)
    window.panel.margin_side.setValue(16.0)
    window.panel.flush()
    assert window.session.mold is None
    assert window.session.state.mold.margin_side == 16.0
    assert window.panel.dim_outer.text().startswith("62.00")
    window.on_undo()  # both edits were coalesced into one step
    assert window.session.mold is not None
    assert window.session.state.mold.margin_side == 10.0
    assert window.panel.margin_side.value() == 10.0


def test_open_model_asks_for_repair(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.open_box(), tmp_path / "acik.stl"))
    qtbot.waitUntil(
        lambda: window.session.state.repaired and not window.runner.busy, timeout=TIMEOUT
    )
    assert window.session.validation.is_watertight


def test_declined_repair_blocks_mold(qtbot, window, tmp_path):
    window.prompts.repair = False
    import_file(qtbot, window, fx.write_mesh(fx.open_box(), tmp_path / "acik.stl"))
    assert not window.toolbar_actions["Negatif Kalıp Oluştur"].isEnabled()
    assert window.warning_list.count() > 0


def test_mode_a_with_undercut_warning(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.inverted_mushroom(), tmp_path / "mantar.stl"))
    window.panel.mode.setCurrentIndex(0)  # Mode A
    window.panel.flush()
    window.on_generate()
    wait_idle(qtbot, window)
    split = window.session.split
    assert split is not None and split.mode == "A"
    assert split.undercut.has_undercuts
    assert any(
        "Ters açı" in window.warning_list.item(i).text() for i in range(window.warning_list.count())
    )


def test_project_save_and_reopen(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.sphere(20.0), tmp_path / "kure.stl"))
    window.panel.margin_top.setValue(12.5)
    window.panel.flush()
    window.prompts.save_path = tmp_path / "proje"
    window.on_save()
    saved = tmp_path / "proje.amproj"
    assert saved.exists()
    assert window.recent.list()[0] == saved.resolve()

    window.on_new()
    assert window.session.model is None
    window.open_project(saved)
    qtbot.waitUntil(
        lambda: window.session.model is not None and not window.runner.busy, timeout=TIMEOUT
    )
    assert window.session.state.mold.margin_top == 12.5
    assert window.panel.margin_top.value() == 12.5


def test_view_toggles_do_not_crash(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.sphere(20.0), tmp_path / "kure.stl"))
    window.on_pins()  # disabled path: no mold yet -> just an error message, no crash
    wait_idle(qtbot, window)
    window.on_generate()
    wait_idle(qtbot, window)
    window.on_pins()
    wait_idle(qtbot, window)
    for action in window.view_actions.values():
        action.toggle()
        action.toggle()
    window.view_actions["exploded"].setChecked(True)
    window.view_actions["section"].setChecked(True)
    window.panel.explode.setValue(50)
    assert window.viewport.options.exploded and window.viewport.options.explode_gap == 50


def test_cancel_stops_the_computation(qtbot, window):
    started = window.run_task("Uzun iş", time.sleep, (30.0,), lambda r: None)
    assert started and window.runner.busy
    t0 = time.perf_counter()
    window.on_cancel()
    assert not window.runner.busy
    window.runner.wait_all()
    assert time.perf_counter() - t0 < 10  # the 30 s job was really stopped
    assert window.toolbar_actions["Model İçe Aktar"].isEnabled()
    # The worker restarts transparently for the next task.
    window.run_task("Kısa iş", abs, (-3,), lambda r: setattr(window, "_probe", r))
    qtbot.waitUntil(lambda: getattr(window, "_probe", None) == 3, timeout=TIMEOUT)


def test_ui_stays_responsive_on_500k_triangles(qtbot, window, tmp_path):
    """While geometry runs in the worker process the event loop must keep ticking.

    Drawing the finished 500k-triangle result happens on the UI thread afterwards; it is
    timed separately (software OpenGL in CI is far slower than a desktop GPU).
    """
    path = fx.write_mesh(fx.high_poly_sphere(), tmp_path / "yuksek.stl")
    ticks = []
    idle_at = []
    timer = QTimer()
    timer.timeout.connect(lambda: ticks.append(time.perf_counter()))
    window.runner.busy_changed.connect(
        lambda busy, _: idle_at.append(time.perf_counter()) if not busy else None
    )
    timer.start(20)

    def measure(start_fn, done):
        ticks.clear()
        idle_at.clear()
        start_fn()
        qtbot.waitUntil(done, timeout=TIMEOUT)
        end = idle_at[-1]
        busy = [t for t in ticks if t <= end]
        gaps = [b - a for a, b in zip(busy, busy[1:], strict=False)]
        after = [t for t in ticks if t > end]
        redraw = (after[0] - end) if after else 0.0
        return (max(gaps) if gaps else 0.0), redraw

    import_gap, import_redraw = measure(
        lambda: window.import_model_file(path),
        lambda: window.session.model is not None and not window.runner.busy,
    )
    mold_gap, mold_redraw = measure(
        window.on_generate, lambda: window.session.mold is not None and not window.runner.busy
    )
    timer.stop()
    print(
        f"max UI gap while busy: import {import_gap:.3f}s, mold {mold_gap:.3f}s; "
        f"redraw after: {import_redraw:.3f}s, {mold_redraw:.3f}s"
    )
    assert len(window.session.model.faces) > 450_000
    assert import_gap < 0.3, import_gap
    assert mold_gap < 0.3, mold_gap
    assert import_redraw < 5.0 and mold_redraw < 5.0


def test_spout_and_vents_buttons(qtbot, window, tmp_path):
    import_file(qtbot, window, fx.write_mesh(fx.two_towers(), tmp_path / "kule.stl"))
    assert not window.toolbar_actions["Döküm Ağzı Ekle"].isEnabled()
    window.panel.plane_offset.setValue(2.5)
    window.panel.flush()
    window.on_generate()
    wait_idle(qtbot, window)
    window.on_pins()
    wait_idle(qtbot, window)
    assert window.toolbar_actions["Döküm Ağzı Ekle"].isEnabled()
    window.on_spout()
    wait_idle(qtbot, window)
    window.on_vents()
    wait_idle(qtbot, window)
    split = window.session.split
    assert [c.kind for c in split.channels][:1] == ["spout"]
    assert any(c.kind == "vent" for c in split.channels)
    assert len(window.viewport.scene.channels) == len(split.channels)
    assert any(
        "öneri" in window.status_list.item(i).text() for i in range(window.status_list.count())
    )
    window.on_undo()
    assert [c.kind for c in window.session.split.channels] == ["spout"]
    # Changing a channel setting drops the stale channels.
    window.panel.spout_diameter.setValue(9.0)
    window.panel.flush()
    assert window.session.split.channels == []
    assert not window.session.state.pouring.spout_enabled
