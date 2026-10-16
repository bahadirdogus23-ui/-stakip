"""Main application window: menus, toolbar, docks and the 3D viewport."""

from __future__ import annotations

import logging

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QCloseEvent
from PySide6.QtWidgets import (
    QDockWidget,
    QLabel,
    QListWidget,
    QMainWindow,
    QMessageBox,
    QTabWidget,
    QToolBar,
    QTreeWidget,
    QVBoxLayout,
    QWidget,
)

from automold3d import APP_NAME, __version__
from automold3d.ui.viewport import Viewport

log = logging.getLogger(__name__)

MENU_TITLES = ("Dosya", "Düzenle", "Model", "Kalıp", "Görünüm", "Araçlar", "Yardım")

# (toolbar label, menu it belongs to, phase that implements it)
TOOLBAR_ACTIONS: tuple[tuple[str, str, int], ...] = (
    ("Model İçe Aktar", "Dosya", 1),
    ("Modeli Analiz Et", "Model", 1),
    ("Negatif Kalıp Oluştur", "Kalıp", 2),
    ("Kalıbı Böl", "Kalıp", 3),
    ("Pimleri Oluştur", "Kalıp", 3),
    ("Döküm Ağzı Ekle", "Kalıp", 6),
    ("Hava Kanalları Ekle", "Kalıp", 6),
    ("Geometriyi Doğrula", "Araçlar", 2),
    ("Projeyi Kaydet", "Dosya", 5),
    ("Dışa Aktar", "Dosya", 4),
)


def not_implemented_tip(phase: int) -> str:
    return f"Henüz uygulanmadı (Aşama {phase})."


class MainWindow(QMainWindow):
    """Top-level window. Operations are wired in later phases."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle(f"{APP_NAME} {__version__}")
        self.resize(1400, 900)

        self.viewport = Viewport(self)
        self.setCentralWidget(self.viewport)

        self.menus = {title: self.menuBar().addMenu(title) for title in MENU_TITLES}
        self.toolbar_actions: dict[str, QAction] = {}
        self._build_toolbar()
        self._build_fixed_menu_items()
        self._build_docks()

        self.statusBar().showMessage("Hazır")
        self.log_status("Uygulama başlatıldı.")
        log.info("Main window created")

    def _build_toolbar(self) -> None:
        toolbar = QToolBar("Araç Çubuğu", self)
        toolbar.setObjectName("main_toolbar")
        self.addToolBar(toolbar)
        for label, menu_title, phase in TOOLBAR_ACTIONS:
            action = QAction(label, self)
            action.setEnabled(False)
            action.setToolTip(not_implemented_tip(phase))
            action.setStatusTip(not_implemented_tip(phase))
            toolbar.addAction(action)
            self.menus[menu_title].addAction(action)
            self.toolbar_actions[label] = action

    def _build_fixed_menu_items(self) -> None:
        self.menus["Dosya"].addSeparator()
        quit_action = QAction("Çıkış", self)
        quit_action.setShortcut("Ctrl+Q")
        quit_action.triggered.connect(self.close)
        self.menus["Dosya"].addAction(quit_action)

        about_action = QAction("Hakkında", self)
        about_action.triggered.connect(self._show_about)
        self.menus["Yardım"].addAction(about_action)

    def _build_docks(self) -> None:
        self.object_tree = QTreeWidget()
        self.object_tree.setHeaderLabel("Nesneler")
        self._add_dock("Nesne ağacı", "dock_tree", self.object_tree, Qt.LeftDockWidgetArea)

        params_panel = QWidget()
        params_layout = QVBoxLayout(params_panel)
        params_layout.addWidget(QLabel("Parametreler model içe aktarıldıktan sonra görünecek."))
        params_layout.addStretch(1)
        self._add_dock("Parametreler", "dock_params", params_panel, Qt.RightDockWidgetArea)

        self.status_list = QListWidget()
        self.warning_list = QListWidget()
        self.error_list = QListWidget()
        self.message_tabs = QTabWidget()
        self.message_tabs.addTab(self.status_list, "Durum")
        self.message_tabs.addTab(self.warning_list, "Uyarılar")
        self.message_tabs.addTab(self.error_list, "Hatalar")
        self._add_dock("Mesajlar", "dock_messages", self.message_tabs, Qt.BottomDockWidgetArea)

    def _add_dock(
        self, title: str, name: str, widget: QWidget, area: Qt.DockWidgetArea
    ) -> QDockWidget:
        dock = QDockWidget(title, self)
        dock.setObjectName(name)
        dock.setWidget(widget)
        self.addDockWidget(area, dock)
        return dock

    def log_status(self, message: str) -> None:
        self.status_list.addItem(message)

    def _show_about(self) -> None:
        QMessageBox.about(
            self,
            "Hakkında",
            f"{APP_NAME} {__version__}\n\n"
            "3D modelden negatif kalıp boşluğu üreten çevrimdışı masaüstü uygulaması.",
        )

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802 (Qt API name)
        self.viewport.shutdown()
        log.info("Main window closed")
        super().closeEvent(event)
