"""All questions the app asks the user, behind one class so tests can answer them."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from automold3d.core.importer import UNIT_TO_MM, supported_extensions
from automold3d.core.project_manager import PROJECT_SUFFIX

UNIT_LABELS = {
    "mm": "milimetre (mm)",
    "cm": "santimetre (cm)",
    "m": "metre (m)",
    "inch": "inç (inch)",
}


@dataclass
class ExportOptions:
    out_dir: Path
    formats: list[str] = field(default_factory=lambda: ["stl"])
    snapshot: bool = True


class Prompter:
    """Real dialogs. Every method returns None when the user cancels."""

    def __init__(self, parent: QWidget) -> None:
        self.parent = parent

    def open_model_path(self) -> Path | None:
        patterns = " ".join(f"*{e}" for e in supported_extensions())
        name, _ = QFileDialog.getOpenFileName(
            self.parent, "Model İçe Aktar", "", f"3D modeller ({patterns})"
        )
        return Path(name) if name else None

    def ask_unit(self, detected: str | None, warnings: list[str]) -> str | None:
        dialog = QDialog(self.parent)
        dialog.setWindowTitle("Birim onayı")
        layout = QVBoxLayout(dialog)
        text = (
            ("Dosyadaki birim: " + UNIT_LABELS[detected])
            if detected
            else ("Dosyada birim bilgisi yok (STL/OBJ birim taşımaz).")
        )
        layout.addWidget(QLabel(text))
        for warning in warnings:
            label = QLabel("⚠ " + warning)
            label.setWordWrap(True)
            layout.addWidget(label)
        combo = QComboBox()
        for unit in UNIT_TO_MM:
            combo.addItem(UNIT_LABELS[unit], unit)
        combo.setCurrentIndex(list(UNIT_TO_MM).index(detected or "mm"))
        form = QFormLayout()
        form.addRow("Modelin birimi:", combo)
        layout.addLayout(form)
        layout.addWidget(QLabel("Model mm'ye çevrilir; başka ölçekleme yapılmaz."))
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        layout.addWidget(buttons)
        if dialog.exec() != QDialog.Accepted:
            return None
        return str(combo.currentData())

    def confirm_repair(self, messages: list[str]) -> bool:
        answer = QMessageBox.question(
            self.parent,
            "Model kapalı değil",
            "Modelin hacmi hesaplanamıyor:\n\n• "
            + "\n• ".join(messages)
            + "\n\nModel otomatik onarılsın mı? (Kaynak dosya değişmez.)",
        )
        return answer == QMessageBox.Yes

    def confirm(self, title: str, text: str) -> bool:
        return QMessageBox.question(self.parent, title, text) == QMessageBox.Yes

    def export_options(self) -> ExportOptions | None:
        dialog = QDialog(self.parent)
        dialog.setWindowTitle("Dışa Aktar")
        layout = QVBoxLayout(dialog)
        row = QHBoxLayout()
        path_edit = QLineEdit(str(Path.home()))
        browse = QPushButton("Gözat…")
        browse.clicked.connect(
            lambda: path_edit.setText(
                QFileDialog.getExistingDirectory(dialog, "Klasör seç", path_edit.text())
                or path_edit.text()
            )
        )
        row.addWidget(path_edit)
        row.addWidget(browse)
        layout.addWidget(QLabel("Hedef klasör:"))
        layout.addLayout(row)
        boxes = {fmt: QCheckBox(fmt.upper()) for fmt in ("stl", "obj", "3mf")}
        boxes["stl"].setChecked(True)
        for box in boxes.values():
            layout.addWidget(box)
        png = QCheckBox("PNG önizleme")
        png.setChecked(True)
        layout.addWidget(png)
        layout.addWidget(QLabel("Dosya adlarına birim eklenir: kalip_parca_1_mm.stl"))
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(dialog.accept)
        buttons.rejected.connect(dialog.reject)
        layout.addWidget(buttons)
        if dialog.exec() != QDialog.Accepted:
            return None
        formats = [f for f, box in boxes.items() if box.isChecked()]
        if not formats:
            self.error("Dışa Aktar", "En az bir dosya biçimi seçin.")
            return None
        return ExportOptions(Path(path_edit.text()), formats, png.isChecked())

    def save_project_path(self) -> Path | None:
        name, _ = QFileDialog.getSaveFileName(
            self.parent, "Projeyi Kaydet", "", f"AutoMold projesi (*{PROJECT_SUFFIX})"
        )
        return Path(name) if name else None

    def open_project_path(self) -> Path | None:
        name, _ = QFileDialog.getOpenFileName(
            self.parent, "Proje Aç", "", f"AutoMold projesi (*{PROJECT_SUFFIX})"
        )
        return Path(name) if name else None

    def error(self, title: str, text: str) -> None:
        QMessageBox.critical(self.parent, title, text)

    def info(self, title: str, text: str) -> None:
        QMessageBox.information(self.parent, title, text)
