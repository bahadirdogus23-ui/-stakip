"""Main application window: menus, toolbar, docks, 3D viewport and operation wiring."""

from __future__ import annotations

import dataclasses
import logging
import time
from collections.abc import Callable
from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QAction, QBrush, QCloseEvent, QColor, QKeySequence
from PySide6.QtWidgets import (
    QDockWidget,
    QHeaderView,
    QLabel,
    QListWidget,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QToolBar,
    QTreeWidget,
    QTreeWidgetItem,
    QWidget,
)

from automold3d import APP_NAME, __version__
from automold3d.core import geometry_checks as qa
from automold3d.core import pipeline
from automold3d.core.errors import AutoMoldError, GeometryError
from automold3d.core.exporter import part_filename
from automold3d.core.importer import ImportResult, file_sha256, load_model
from automold3d.core.mold_generator import preview_body
from automold3d.core.params import CastMode
from automold3d.core.project_manager import (
    History,
    ProjectError,
    ProjectState,
    RecentProjects,
    Session,
    load_project,
    save_project,
)
from automold3d.ui.parameter_panel import ParameterPanel
from automold3d.ui.prompts import Prompter
from automold3d.ui.viewport import Scene, ViewOptions, Viewport
from automold3d.ui.worker import TaskRunner

log = logging.getLogger(__name__)

MENU_TITLES = ("Dosya", "Düzenle", "Model", "Kalıp", "Görünüm", "Araçlar", "Yardım")
PARAM_LABEL = "Parametre değişikliği"

# (label, menu, method name)
TOOLBAR_ACTIONS: tuple[tuple[str, str, str], ...] = (
    ("Model İçe Aktar", "Dosya", "on_import"),
    ("Modeli Analiz Et", "Model", "on_analyze"),
    ("Negatif Kalıp Oluştur", "Kalıp", "on_generate"),
    ("Kalıbı Böl", "Kalıp", "on_split"),
    ("Pimleri Oluştur", "Kalıp", "on_pins"),
    ("Döküm Ağzı Ekle", "Kalıp", "on_spout"),
    ("Hava Kanalları Ekle", "Kalıp", "on_vents"),
    ("Geometriyi Doğrula", "Araçlar", "on_validate"),
    ("Projeyi Kaydet", "Dosya", "on_save"),
    ("Dışa Aktar", "Dosya", "on_export"),
)

VIEW_TOGGLES: tuple[tuple[str, str], ...] = (
    ("Pozitif model", "show_model"),
    ("Negatif boşluk", "show_cavity"),
    ("Dış gövde", "show_body"),
    ("Patlatılmış görünüm", "exploded"),
    ("Kesit", "section"),
    ("Şeffaf", "transparent"),
    ("Tel kafes", "wireframe"),
    ("Ölçüler", "dimensions"),
    ("Pim/kanal", "show_pins"),
)

STATUS_COLORS = {
    qa.CheckStatus.PASSED: "#2e9d4f",
    qa.CheckStatus.WARNING: "#d08a00",
    qa.CheckStatus.ERROR: "#d03030",
    qa.CheckStatus.MANUAL: "#4a7fd0",
}


class MainWindow(QMainWindow):
    """Top-level window. All geometry runs in background tasks via TaskRunner."""

    def __init__(
        self,
        prompter_factory: Callable[[QWidget], Prompter] = Prompter,
        recent: RecentProjects | None = None,
    ) -> None:
        super().__init__()
        self.resize(1500, 950)
        self.history = History(Session(state=ProjectState()))
        self.project_path: Path | None = None
        self.prompts = prompter_factory(self)
        self.recent = recent if recent is not None else RecentProjects()
        self.runner = TaskRunner(self)
        self.runner.succeeded.connect(self._task_succeeded)
        self.runner.failed.connect(self._task_failed)
        self.runner.busy_changed.connect(self._busy_changed)
        self._callbacks: dict[str, Callable[[object], None]] = {}

        self.viewport = Viewport(self)
        self.setCentralWidget(self.viewport)
        self.menus = {title: self.menuBar().addMenu(title) for title in MENU_TITLES}
        self.toolbar_actions: dict[str, QAction] = {}
        self.view_actions: dict[str, QAction] = {}
        self._build_toolbar()
        self._build_menus()
        self._build_docks()
        self._build_status()
        self.panel.set_state(self.session.state)
        self._update_title()
        self._refresh()
        self.log_status("Uygulama başlatıldı. Başlamak için 'Model İçe Aktar'.")
        log.info("Main window created")

    # ================================================================ building
    @property
    def session(self) -> Session:
        return self.history.current

    def _build_toolbar(self) -> None:
        toolbar = QToolBar("Araç Çubuğu", self)
        toolbar.setObjectName("main_toolbar")
        self.addToolBar(toolbar)
        for label, menu_title, method in TOOLBAR_ACTIONS:
            action = QAction(label, self)
            action.triggered.connect(getattr(self, method))
            toolbar.addAction(action)
            self.menus[menu_title].addAction(action)
            self.toolbar_actions[label] = action
        self.toolbar_actions["Model İçe Aktar"].setShortcut(QKeySequence("Ctrl+I"))
        self.toolbar_actions["Projeyi Kaydet"].setShortcut(QKeySequence.Save)
        self.toolbar_actions["Döküm Ağzı Ekle"].setToolTip(
            "Boşluğun en yüksek noktasından dışarı döküm ağzı açar (varsayılan: kapalı)."
        )
        self.toolbar_actions["Hava Kanalları Ekle"].setToolTip(
            "Hava kapanı önerilerinden dışarı kanal açar (öneri; akış simülasyonu yapılmaz)."
        )

    def _build_menus(self) -> None:
        file_menu = self.menus["Dosya"]
        file_menu.addSeparator()
        self._add_action(file_menu, "Yeni Proje", self.on_new, QKeySequence.New)
        self._add_action(file_menu, "Proje Aç…", self.on_open_project, QKeySequence.Open)
        self.recent_menu = file_menu.addMenu("Son Projeler")
        self.recent_menu.aboutToShow.connect(self._fill_recent_menu)
        self._add_action(file_menu, "Farklı Kaydet…", self.on_save_as, QKeySequence.SaveAs)
        file_menu.addSeparator()
        self._add_action(file_menu, "Çıkış", self.close, QKeySequence("Ctrl+Q"))

        edit = self.menus["Düzenle"]
        self.undo_action = self._add_action(edit, "Geri Al", self.on_undo, QKeySequence.Undo)
        self.redo_action = self._add_action(edit, "Yinele", self.on_redo, QKeySequence.Redo)

        self._add_action(self.menus["Model"], "Modeli Onar", self.on_repair)
        self.menus["Kalıp"].addSeparator()
        self.suggest_action = self._add_action(
            self.menus["Kalıp"], "Çok parçalı düzlemleri öner", self.on_suggest_planes
        )

        view = self.menus["Görünüm"]
        defaults = ViewOptions()
        for label, attr in VIEW_TOGGLES:
            action = QAction(label, self, checkable=True)
            action.setChecked(bool(getattr(defaults, attr)))
            action.toggled.connect(self._view_changed)
            view.addAction(action)
            self.view_actions[attr] = action
        view.addSeparator()
        self._add_action(view, "Kamerayı sıfırla", lambda: self.viewport.render_scene(True))

        self._add_action(self.menus["Araçlar"], "İşlemi İptal Et", self.on_cancel)
        self._add_action(self.menus["Yardım"], "Hakkında", self._show_about)

    def _add_action(
        self,
        menu: object,
        label: str,
        slot: Callable[[], object],
        shortcut: QKeySequence | QKeySequence.StandardKey | None = None,
    ) -> QAction:
        action = QAction(label, self)
        action.triggered.connect(slot)
        if shortcut is not None:
            action.setShortcut(shortcut)
        menu.addAction(action)  # type: ignore[attr-defined]
        return action

    def _build_docks(self) -> None:
        self.object_tree = QTreeWidget()
        self.object_tree.setHeaderLabel("Nesneler")
        self._add_dock("Nesne ağacı", "dock_tree", self.object_tree, Qt.LeftDockWidgetArea)

        self.panel = ParameterPanel()
        self.panel.changed.connect(self._params_changed)
        self.panel.explode_changed.connect(self._explode_changed)
        self._add_dock("Parametreler", "dock_params", self.panel, Qt.RightDockWidgetArea)

        self.status_list = QListWidget()
        self.warning_list = QListWidget()
        self.error_list = QListWidget()
        self.check_table = QTableWidget(0, 3)
        self.check_table.setHorizontalHeaderLabels(["Kontrol", "Durum", "Mesaj"])
        header = self.check_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.ResizeToContents)
        header.setSectionResizeMode(2, QHeaderView.Stretch)
        self.check_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.message_tabs = QTabWidget()
        self.message_tabs.addTab(self.status_list, "Durum")
        self.message_tabs.addTab(self.warning_list, "Uyarılar")
        self.message_tabs.addTab(self.error_list, "Hatalar")
        self.message_tabs.addTab(self.check_table, "Kontroller")
        self._add_dock("Mesajlar", "dock_messages", self.message_tabs, Qt.BottomDockWidgetArea)

    def _add_dock(
        self, title: str, name: str, widget: QWidget, area: Qt.DockWidgetArea
    ) -> QDockWidget:
        dock = QDockWidget(title, self)
        dock.setObjectName(name)
        dock.setWidget(widget)
        self.addDockWidget(area, dock)
        return dock

    def _build_status(self) -> None:
        # A static label with elapsed seconds instead of an animated progress bar: animation
        # repaints would re-render the 3D view many times per second (slow on big meshes).
        self.task_label = QLabel("")
        self.cancel_button = QPushButton("İptal")
        self.cancel_button.clicked.connect(self.on_cancel)
        for w in (self.task_label, self.cancel_button):
            self.statusBar().addPermanentWidget(w)
            w.setVisible(False)
        self._task_name = ""
        self._task_started = 0.0
        self._task_timer = QTimer(self)
        self._task_timer.setInterval(1000)
        self._task_timer.timeout.connect(self._tick_task_label)
        self.statusBar().showMessage("Hazır")

    def _tick_task_label(self) -> None:
        elapsed = int(time.monotonic() - self._task_started)
        self.task_label.setText(f"{self._task_name} sürüyor… {elapsed} sn")

    # ================================================================ messages
    def log_status(self, message: str) -> None:
        self.status_list.addItem(message)
        self.status_list.scrollToBottom()
        self.statusBar().showMessage(message, 8000)

    def log_warning(self, message: str) -> None:
        self.warning_list.addItem(message)
        self.warning_list.scrollToBottom()

    def log_error(self, message: str) -> None:
        self.error_list.addItem(message)
        self.error_list.scrollToBottom()
        self.message_tabs.setCurrentWidget(self.error_list)

    def show_checks(self, checks: list[qa.CheckResult]) -> None:
        self.check_table.setRowCount(len(checks))
        for row, check in enumerate(checks):
            status = QTableWidgetItem(check.status.value)
            status.setForeground(QBrush(QColor(STATUS_COLORS[check.status])))
            for col, item in enumerate(
                (QTableWidgetItem(check.name), status, QTableWidgetItem(check.message))
            ):
                self.check_table.setItem(row, col, item)
        for check in checks:
            if check.status is qa.CheckStatus.WARNING or check.status is qa.CheckStatus.MANUAL:
                self.log_warning(f"{check.name}: {check.message}")
            elif check.status is qa.CheckStatus.ERROR:
                self.log_error(f"{check.name}: {check.message}")
        if checks:
            self.log_status(qa.readiness_message(checks))
            self.message_tabs.setCurrentWidget(self.check_table)

    # ================================================================ tasks
    def run_task(
        self,
        name: str,
        fn: Callable[..., object],
        args: tuple[object, ...],
        on_ok: Callable[[object], None],
    ) -> bool:
        """Run module-level `fn(*args)` in the geometry process; `on_ok` gets the result."""
        if self.runner.busy:
            self.log_warning("Başka bir işlem sürüyor; bitmesini bekleyin veya iptal edin.")
            return False
        self._callbacks[name] = on_ok
        return self.runner.start(name, fn, args)

    def _task_succeeded(self, name: str, result: object) -> None:
        callback = self._callbacks.pop(name, None)
        if callback is not None:
            callback(result)
        self._refresh()

    def _task_failed(self, name: str, error: object) -> None:
        self._callbacks.pop(name, None)
        self.report_error(name, error)
        self._refresh()

    def report_error(self, title: str, error: object) -> None:
        if isinstance(error, AutoMoldError):
            message = error.user_message
            log.error("%s failed: %s | %s", title, error.user_message, error.detail)
        else:
            message = f"Beklenmeyen hata: {error}. Ayrıntılar logs/automold.log dosyasında."
            log.error("%s failed unexpectedly: %r", title, error)
        self.log_error(f"{title}: {message}")
        self.prompts.error(title, message)

    def _busy_changed(self, busy: bool, name: str) -> None:
        self._task_name = name
        self._task_started = time.monotonic()
        if busy:
            self._tick_task_label()
            self._task_timer.start()
        else:
            self._task_timer.stop()
        for w in (self.task_label, self.cancel_button):
            w.setVisible(busy)
        self._update_actions()

    def on_cancel(self) -> None:
        if self.runner.busy:
            self.runner.cancel()
            self.log_warning("İşlem iptal edildi; sonucu kullanılmayacak.")

    # ================================================================ history
    def push(self, session: Session) -> None:
        self.history.push(session)
        self.panel.set_state(session.state)
        self._refresh(reset_camera=session.label == "Model içe aktarma")

    def on_undo(self) -> None:
        if self.history.can_undo():
            label = self.history.undo_label
            self.history.undo()
            self.panel.set_state(self.session.state)
            self.log_status(f"Geri alındı: {label}")
            self._refresh()

    def on_redo(self) -> None:
        if self.history.can_redo():
            self.history.redo()
            self.panel.set_state(self.session.state)
            self.log_status(f"Yinelendi: {self.session.label}")
            self._refresh()

    def _params_changed(self) -> None:
        if self.panel.input_error:
            self.log_error(self.panel.input_error)
        old = self.session.state
        new = self.panel.state_from_ui(old)
        if new == old:
            return
        session = self.session.snapshot(PARAM_LABEL)
        session.state = new
        if _mold_inputs(old) != _mold_inputs(new):
            session.mold = session.split = session.split_base = None
        elif _split_inputs(old) != _split_inputs(new) and session.state.mode in ("B", "C"):
            session.split = session.split_base = None
        elif old.pouring != new.pouring and session.split is not session.split_base:
            # Channel geometry is stale: drop it; the user re-adds it with the new values.
            session.split = session.split_base
            new.pouring.spout_enabled = new.pouring.vents_enabled = False
            self.log_warning("Döküm ağzı/kanal ayarı değişti; kanalları yeniden ekleyin.")
        if self.session.label == PARAM_LABEL and self.history.can_undo():
            self.history.replace_current(session)
        else:
            self.history.push(session)
        if old.cast_mode is not new.cast_mode:
            self.log_status(f"Kullanım: {_cast_label(new.cast_mode)}; varsayılanlar uygulandı.")
        self._refresh()

    # ================================================================ operations
    def on_import(self) -> None:
        path = self.prompts.open_model_path()
        if path is not None:
            self.import_model_file(path)

    def import_model_file(
        self, path: Path, state: ProjectState | None = None, unit: str | None = None
    ) -> None:
        """Step 1: parse in the background. Step 2: confirm unit. Step 3: validate."""
        self.panel.flush()

        def parsed(result: object) -> None:
            source: ImportResult = result  # type: ignore[assignment]
            for warning in source.warnings:
                self.log_warning(warning)
            chosen = unit or self.prompts.ask_unit(source.detected_unit, source.warnings)
            if chosen is None:
                self.log_status("İçe aktarma iptal edildi.")
                return
            base = state or dataclasses.replace(self.session.state, pin_positions=None)
            self.run_task(
                "Model doğrulama",
                pipeline.session_from_import,
                (source, chosen, base),
                lambda s: self._imported(s, repaired=bool(state and state.repaired)),
            )

        self.run_task("Model içe aktarma", load_model, (path,), parsed)

    def _imported(self, result: object, repaired: bool = False) -> None:
        session: Session = result  # type: ignore[assignment]
        self.push(session)
        model = session.model
        self.log_status(
            f"Model yüklendi: {Path(session.state.source_path or '').name}, "
            f"{len(model.faces)} üçgen."
        )  # type: ignore[union-attr]
        validation = session.validation
        if validation is None:
            return
        for message in validation.messages:
            (
                self.log_status
                if validation.is_valid_solid or validation.is_watertight
                else self.log_warning
            )(message)
        if repaired:  # the project was saved after a repair: apply it again
            self._run_repair()
        elif not validation.is_watertight or validation.volume is None:
            if self.prompts.confirm_repair(validation.messages):
                self._run_repair()
            else:
                self.log_warning("Model onarılmadı: hacim hesaplanamadığı için kalıp üretilemez.")

    def on_repair(self) -> None:
        if self.session.model is not None:
            self._run_repair()

    def _run_repair(self) -> None:
        def done(result: object) -> None:
            session: Session = result  # type: ignore[assignment]
            self.push(session)
            for message in session.validation.messages:  # type: ignore[union-attr]
                self.log_status("Onarım sonrası: " + message)

        self.run_task("Model onarma", pipeline.repair, (self.session,), done)

    def on_analyze(self) -> None:
        self.panel.flush()
        session = self.session

        def done(result: object) -> None:
            analysis: pipeline.AnalysisResult = result  # type: ignore[assignment]
            self.push(analysis.session)
            for message in analysis.session.validation.messages:  # type: ignore[union-attr]
                self.log_status(message)
            if analysis.suggestions:
                best = analysis.suggestions[0]
                n = ", ".join(f"{c:.2f}" for c in best.plane.unit_normal())
                text = (
                    f"Öneri: normal ({n}), ofset {best.plane.offset:.2f} mm, "
                    f"ters açı alanı {best.undercut_area:.1f} mm²."
                )
                self.panel.suggestion_label.setText(text)
                self.log_status(text + " Düzlem parametrelere uygulandı.")

        self.run_task("Model analizi", pipeline.analyze, (session,), done)

    def on_generate(self) -> None:
        self.panel.flush()
        session = self.session
        self.run_task("Negatif kalıp", pipeline.build_mold, (session,), self._built)

    def on_split(self) -> None:
        self.panel.flush()
        session = self.session
        self.run_task("Kalıbı bölme", pipeline.split, (session,), self._built)

    def on_pins(self) -> None:
        self.panel.flush()
        session = self.session
        self.run_task("Pimler", pipeline.split, (session, True), self._built)

    def on_suggest_planes(self) -> None:
        self.panel.flush()

        def done(result: object) -> None:
            session, auto = result  # type: ignore[misc]
            self.push(session)
            (self.log_status if auto.success else self.log_warning)(auto.message)
            if not auto.success:
                self.prompts.info("Otomatik bölme", auto.message)

        self.run_task("Düzlem önerisi", pipeline.suggest_planes, (self.session,), done)

    def on_spout(self) -> None:
        self.panel.flush()
        self.run_task(
            "Döküm ağzı", pipeline.add_channels, (self.session, True, None), self._channels_added
        )

    def on_vents(self) -> None:
        self.panel.flush()
        self.run_task(
            "Hava kanalları",
            pipeline.add_channels,
            (self.session, None, True),
            self._channels_added,
        )

    def _channels_added(self, result: object) -> None:
        self._built(result)
        split = self.session.split
        if split is not None and split.air_traps:
            points = "; ".join(", ".join(f"{c:.1f}" for c in t.point) for t in split.air_traps[:6])
            self.log_status(f"Hava kapanı önerileri (öneri, simülasyon değil): {points}")

    def _built(self, result: object) -> None:
        session: Session = result  # type: ignore[assignment]
        self.push(session)
        self.log_status(f"{session.label} tamamlandı.")
        self.show_checks(pipeline.current_checks(session))

    def on_validate(self) -> None:
        checks = pipeline.current_checks(self.session)
        if not checks:
            self.log_warning("Doğrulanacak kalıp yok; önce negatif kalıbı oluşturun.")
            return
        self.show_checks(checks)
        self.prompts.info("Geometri doğrulama", qa.readiness_message(checks))

    def on_export(self) -> None:
        self.panel.flush()
        session = self.session
        if session.split is None:
            self.report_error(
                "Dışa Aktar",
                GeometryError(
                    "Dışa aktarılacak parça yok. Mod B'de kalıbı bölün; Mod A'da kalıbı oluşturun.",
                    "no split",
                ),
            )
            return
        options = self.prompts.export_options()
        if options is None:
            return
        existing = [
            part_filename(p, f)
            for p in session.split.parts
            for f in options.formats
            if (options.out_dir / part_filename(p, f)).exists()
        ]
        overwrite = False
        if existing:
            if not self.prompts.confirm(
                "Dosyalar var", "Şu dosyaların üzerine yazılsın mı?\n" + "\n".join(existing)
            ):
                return
            overwrite = True

        def done(result: object) -> None:
            report, files = result  # type: ignore[misc]
            self.log_status(f"{len(files)} dosya yazıldı: {options.out_dir}")
            self.log_status(str(report["sonuc"]))
            if not report["uretime_hazir"]:
                self.log_warning("Kalıp üretime hazır sayılmaz; Kontroller sekmesine bakın.")

        self.run_task(
            "Dışa aktarma",
            pipeline.export,
            (session, options.out_dir, options.formats, overwrite, options.snapshot),
            done,
        )

    # ================================================================ projects
    def on_new(self) -> None:
        if self.runner.busy:
            return
        self.history = History(Session(state=ProjectState()))
        self.project_path = None
        self.panel.set_state(self.session.state)
        self._update_title()
        self._refresh(reset_camera=True)
        self.log_status("Yeni proje.")

    def on_save(self) -> None:
        self.save_project_to(self.project_path)

    def on_save_as(self) -> None:
        self.save_project_to(None)

    def save_project_to(self, path: Path | None) -> None:
        self.panel.flush()
        target = path or self.prompts.save_project_path()
        if target is None:
            return
        try:
            saved = save_project(self.session.state, target)
        except ProjectError as exc:
            self.report_error("Projeyi Kaydet", exc)
            return
        self.project_path = saved
        self.recent.add(saved)
        self._update_title()
        self.log_status(f"Proje kaydedildi: {saved}")

    def on_open_project(self) -> None:
        path = self.prompts.open_project_path()
        if path is not None:
            self.open_project(path)

    def open_project(self, path: Path) -> None:
        try:
            state = load_project(path)
        except ProjectError as exc:
            self.report_error("Proje Aç", exc)
            return
        self.history = History(Session(state=state))
        self.project_path = path
        self.recent.add(path)
        self.panel.set_state(state)
        self._update_title()
        self._refresh(reset_camera=True)
        self.log_status(f"Proje açıldı: {path}")
        source = Path(state.source_path) if state.source_path else None
        if source is None:
            return
        if not source.exists():
            self.report_error(
                "Proje Aç",
                ProjectError(
                    f"Kaynak model bulunamadı: {source}. Modeli yeniden içe aktarın.", "missing"
                ),
            )
            return
        if state.source_sha256 and file_sha256(source) != state.source_sha256:
            self.log_warning("Kaynak model dosyası proje kaydedildikten sonra değişmiş.")
        self.import_model_file(source, state=state, unit=state.source_unit)
        self.log_status("Kalıp sonuçları projede saklanmaz; işlemleri yeniden çalıştırın.")

    def _fill_recent_menu(self) -> None:
        self.recent_menu.clear()
        paths = self.recent.list()
        if not paths:
            self.recent_menu.addAction("(boş)").setEnabled(False)
        for path in paths:
            action = self.recent_menu.addAction(str(path))
            action.triggered.connect(lambda _=False, p=path: self.open_project(p))

    # ================================================================ view
    def _view_changed(self) -> None:
        options = dataclasses.replace(
            self.viewport.options,
            **{attr: action.isChecked() for attr, action in self.view_actions.items()},
        )
        self.viewport.set_options(options)

    def _explode_changed(self, gap: float) -> None:
        self.viewport.set_options(dataclasses.replace(self.viewport.options, explode_gap=gap))

    def build_scene(self) -> Scene:
        s = self.session
        scene = Scene(model=s.model)
        if s.split is not None:
            scene.parts = list(s.split.parts)
            scene.cavity = s.split.cavity_model
            scene.undercut_mask = s.split.undercut.face_mask
            if s.split.pins is not None:
                scene.pins = list(s.split.pins.pins)
            scene.channels = [c.mesh for c in s.split.channels]
            scene.markers = [t.point for t in s.split.air_traps]
        elif s.mold is not None:
            scene.mold = s.mold.mold
            scene.cavity = s.mold.cavity_model
        elif s.model is not None and s.validation is not None and s.validation.is_watertight:
            try:
                scene.body_preview = preview_body(s.model, s.state.mold)
            except GeometryError as exc:
                self.log_warning(exc.user_message)
        if s.model is not None and s.split is None:
            if s.state.mode == "B":
                scene.planes = [s.state.plane]
            elif s.state.mode == "C":
                scene.planes = list(s.state.planes)
        return scene

    def _refresh(self, reset_camera: bool = False) -> None:
        scene = self.build_scene()
        self.viewport.show_scene(scene, reset_camera)
        self._update_tree(scene)
        self._update_dimensions(scene)
        self._update_actions()

    def _update_dimensions(self, scene: Scene) -> None:
        s = self.session
        obj = tuple(float(v) for v in s.model.extents) if s.model is not None else None
        cavity = tuple(float(v) for v in scene.cavity.extents) if scene.cavity is not None else None
        if cavity is None and obj is not None:
            factor = 1.0 + s.state.mold.shrinkage_percent / 100.0
            cavity = tuple(v * factor for v in obj)
        outer = None
        for mesh in [scene.body_preview, scene.mold, *[p.mesh for p in scene.parts]]:
            if mesh is not None:
                outer = tuple(float(v) for v in mesh.extents)
                break
        if s.mold is not None:
            outer = s.mold.outer_dimensions
        self.panel.set_dimensions(obj, cavity, outer)

    def _update_tree(self, scene: Scene) -> None:
        self.object_tree.clear()
        if scene.model is not None:
            QTreeWidgetItem(self.object_tree, [f"Pozitif model ({len(scene.model.faces)} üçgen)"])
        if scene.body_preview is not None:
            QTreeWidgetItem(self.object_tree, ["Dış gövde (önizleme)"])
        if scene.mold is not None:
            QTreeWidgetItem(self.object_tree, ["Negatif kalıp (bölünmemiş)"])
        if scene.parts:
            root = QTreeWidgetItem(self.object_tree, [f"Kalıp parçaları ({len(scene.parts)})"])
            for part in scene.parts:
                QTreeWidgetItem(root, [f"{part.part_id}: {part.name}"])
            if scene.pins:
                QTreeWidgetItem(root, [f"Pimler ({len(scene.pins)})"])
            if scene.channels:
                QTreeWidgetItem(root, [f"Döküm ağzı / kanallar ({len(scene.channels)})"])
            root.setExpanded(True)

    def _update_actions(self) -> None:
        s = self.session
        idle = not self.runner.busy
        has_model = s.model is not None
        solid = bool(
            has_model
            and s.validation is not None
            and s.validation.is_watertight
            and s.validation.volume
        )
        mode_b = s.state.mode in ("B", "C")  # modes that split a closed mold
        enabled = {
            "Model İçe Aktar": idle,
            "Modeli Analiz Et": idle and has_model,
            "Negatif Kalıp Oluştur": idle and solid,
            "Kalıbı Böl": idle and mode_b and s.mold is not None,
            "Pimleri Oluştur": idle and mode_b and s.mold is not None,
            "Döküm Ağzı Ekle": idle and s.split is not None,
            "Hava Kanalları Ekle": idle and s.split is not None,
            "Geometriyi Doğrula": idle and (s.mold is not None or s.split is not None),
            "Projeyi Kaydet": idle,
            "Dışa Aktar": idle and s.split is not None,
        }
        for label, value in enabled.items():
            self.toolbar_actions[label].setEnabled(value)
        self.suggest_action.setEnabled(idle and solid and s.state.mode == "C")
        self.undo_action.setEnabled(idle and self.history.can_undo())
        self.redo_action.setEnabled(idle and self.history.can_redo())
        self.undo_action.setText(
            f"Geri Al: {self.history.undo_label}" if self.history.can_undo() else "Geri Al"
        )
        self.redo_action.setText(
            f"Yinele: {self.history.redo_label}" if self.history.can_redo() else "Yinele"
        )

    def _update_title(self) -> None:
        name = self.project_path.name if self.project_path else "Adsız proje"
        self.setWindowTitle(f"{APP_NAME} {__version__} — {name}")

    def _show_about(self) -> None:
        QMessageBox.about(
            self,
            "Hakkında",
            f"{APP_NAME} {__version__}\n\n"
            "3D modelden Boolean fark ile gerçek negatif kalıp boşluğu üreten, kalıbı bölen ve "
            "parçaları dışa aktaran çevrimdışı masaüstü uygulaması.",
        )

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802 (Qt API name)
        self.runner.shutdown()
        self.viewport.shutdown()
        log.info("Main window closed")
        super().closeEvent(event)


def _mold_inputs(state: ProjectState) -> tuple[object, ...]:
    return (state.mold, state.mode, state.pull_dir, state.opening_offset)


def _split_inputs(state: ProjectState) -> tuple[object, ...]:
    return (state.plane, state.pins, state.pin_positions, state.planes)


def _cast_label(mode: CastMode) -> str:
    return "silikon kalıp" if mode is CastMode.SILICONE_MOLD else "içine döküm kalıbı"
