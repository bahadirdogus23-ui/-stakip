"""3D viewport widget built on pyvistaqt."""

from __future__ import annotations

from PySide6.QtWidgets import QVBoxLayout, QWidget
from pyvistaqt import QtInteractor


class Viewport(QWidget):
    """Central 3D view. Holds a single PyVista interactor."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.plotter = QtInteractor(self)
        self.plotter.set_background("#2b2b2b", top="#4a4a4a")
        self.plotter.add_axes()
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.plotter.interactor)

    def shutdown(self) -> None:
        """Release VTK resources; must be called before the window is destroyed."""
        self.plotter.close()
