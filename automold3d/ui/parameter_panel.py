"""Right-hand parameter panel. Converts between widgets and ProjectState."""

from __future__ import annotations

import copy
import dataclasses
import math

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QFormLayout,
    QGroupBox,
    QLabel,
    QLineEdit,
    QScrollArea,
    QSlider,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from automold3d.core.params import BodyShape, CastMode, MoldParams, PartingPlane, PouringParams
from automold3d.core.project_manager import ProjectState

PULL_DIRECTIONS = {
    "+Z (yukarı)": (0.0, 0.0, 1.0),
    "-Z (aşağı)": (0.0, 0.0, -1.0),
    "+X": (1.0, 0.0, 0.0),
    "-X": (-1.0, 0.0, 0.0),
    "+Y": (0.0, 1.0, 0.0),
    "-Y": (0.0, -1.0, 0.0),
}
PLANE_AXES = {"X": (1.0, 0.0, 0.0), "Y": (0.0, 1.0, 0.0), "Z": (0.0, 0.0, 1.0)}
ANGLED = "Açılı"
DEBOUNCE_MS = 400


def _spin(
    lo: float, hi: float, value: float, step: float = 0.5, decimals: int = 2, suffix: str = " mm"
) -> QDoubleSpinBox:
    box = QDoubleSpinBox()
    box.setRange(lo, hi)
    box.setDecimals(decimals)
    box.setSingleStep(step)
    box.setValue(value)
    box.setSuffix(suffix)
    box.setKeyboardTracking(False)
    return box


def format_positions(positions: list[tuple[float, ...]] | None) -> str:
    if not positions:
        return ""
    return "; ".join(", ".join(f"{c:g}" for c in p) for p in positions)


def parse_positions(text: str, dims: int) -> list[tuple[float, ...]] | None:
    """'x, y; x, y' -> list. Empty = automatic (None). Raises ValueError on bad input."""
    text = text.strip()
    if not text:
        return None
    out = []
    for chunk in text.split(";"):
        values = [float(v) for v in chunk.replace(" ", "").split(",") if v]
        if len(values) != dims:
            raise ValueError(chunk)
        out.append(tuple(values))
    return out


class ParameterPanel(QScrollArea):
    """Emits `changed` (debounced) after the user edits any value."""

    changed = Signal()
    explode_changed = Signal(float)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWidgetResizable(True)
        self._loading = False
        self._debounce = QTimer(self)
        self._debounce.setSingleShot(True)
        self._debounce.setInterval(DEBOUNCE_MS)
        self._debounce.timeout.connect(self.changed.emit)
        self.input_error = ""

        content = QWidget()
        self.layout_ = QVBoxLayout(content)
        self._build_project()
        self._build_body()
        self._build_mode()
        self._build_plane()
        self._build_pins()
        self._build_pouring()
        self._build_view()
        self._build_dimensions()
        self.layout_.addStretch(1)
        self.setWidget(content)
        self._update_enabled()

    # ------------------------------------------------------------ building
    def _group(self, title: str) -> QFormLayout:
        box = QGroupBox(title)
        form = QFormLayout(box)
        self.layout_.addWidget(box)
        return form

    def _watch(self, *widgets: QWidget) -> None:
        for w in widgets:
            if isinstance(w, QComboBox):
                w.currentIndexChanged.connect(self._edited)
            elif isinstance(w, QCheckBox):
                w.toggled.connect(self._edited)
            elif isinstance(w, QLineEdit):
                w.editingFinished.connect(self._edited)
            else:
                w.valueChanged.connect(self._edited)  # type: ignore[attr-defined]

    def _build_project(self) -> None:
        form = self._group("Proje")
        self.cast_mode = QComboBox()
        self.cast_mode.addItem("Silikon kalıp (nesnenin kalıbı)", CastMode.SILICONE_MOLD)
        self.cast_mode.addItem("İçine döküm kalıbı (alçı/reçine/beton)", CastMode.CAST_INTO_MOLD)
        self.cast_mode.setToolTip(
            "Yalnızca varsayılan duvar, döküm ağzı ve kanal değerlerini değiştirir."
        )
        self.cast_mode.currentIndexChanged.connect(self._apply_cast_defaults)
        form.addRow("Kullanım:", self.cast_mode)

    def _build_body(self) -> None:
        form = self._group("Kalıp gövdesi")
        self.body_shape = QComboBox()
        self.body_shape.addItem("Otomatik kutu (model + paylar)", BodyShape.AUTO_BOX)
        self.body_shape.addItem("Kutu (ölçü girilir)", BodyShape.BOX)
        self.body_shape.addItem("Silindir", BodyShape.CYLINDER)
        self.margin_side = _spin(0, 500, 10)
        self.margin_top = _spin(0, 500, 10)
        self.margin_bottom = _spin(0, 500, 10)
        self.box_x, self.box_y, self.box_z = (_spin(1, 5000, 100) for _ in range(3))
        self.min_wall = _spin(0.1, 200, 5)
        self.shrinkage = _spin(-49, 49, 0.0, 0.1, 2, " %")
        self.shrinkage.setToolTip("Malzeme çekmesi telafisi. Boşluk (1 + %/100) ile ölçeklenir.")
        form.addRow("Gövde:", self.body_shape)
        form.addRow("Yan pay:", self.margin_side)
        form.addRow("Üst pay:", self.margin_top)
        form.addRow("Alt pay:", self.margin_bottom)
        form.addRow("Kutu X:", self.box_x)
        form.addRow("Kutu Y:", self.box_y)
        form.addRow("Kutu Z:", self.box_z)
        form.addRow("Min. duvar:", self.min_wall)
        form.addRow("Çekme payı:", self.shrinkage)
        self._watch(
            self.body_shape,
            self.margin_side,
            self.margin_top,
            self.margin_bottom,
            self.box_x,
            self.box_y,
            self.box_z,
            self.min_wall,
            self.shrinkage,
        )

    def _build_mode(self) -> None:
        form = self._group("Kalıp modu")
        self.mode = QComboBox()
        self.mode.addItem("A — Tek parça açık kalıp", "A")
        self.mode.addItem("B — İki parçalı kalıp", "B")
        self.pull_dir = QComboBox()
        for label, vec in PULL_DIRECTIONS.items():
            self.pull_dir.addItem(label, vec)
        self.opening_auto = QCheckBox("Açıklık modelin üstünde (otomatik)")
        self.opening_auto.setChecked(True)
        self.opening_offset = _spin(-10000, 10000, 0)
        form.addRow("Mod:", self.mode)
        form.addRow("Çıkarma yönü:", self.pull_dir)
        form.addRow(self.opening_auto)
        form.addRow("Açıklık düzlemi:", self.opening_offset)
        self._watch(self.mode, self.pull_dir, self.opening_auto, self.opening_offset)

    def _build_plane(self) -> None:
        form = self._group("Ayırma düzlemi (Mod B)")
        self.plane_axis = QComboBox()
        for label in [*PLANE_AXES, ANGLED]:
            self.plane_axis.addItem(label)
        self.plane_azimuth = _spin(-360, 360, 0, 5, 1, " °")
        self.plane_elevation = _spin(-90, 90, 90, 5, 1, " °")
        self.plane_offset = _spin(-10000, 10000, 0)
        self.suggestion_label = QLabel("Öneri için 'Modeli Analiz Et'.")
        self.suggestion_label.setWordWrap(True)
        form.addRow("Normal:", self.plane_axis)
        form.addRow("Azimut:", self.plane_azimuth)
        form.addRow("Yükseklik açısı:", self.plane_elevation)
        form.addRow("Ofset:", self.plane_offset)
        form.addRow(self.suggestion_label)
        self._watch(self.plane_axis, self.plane_azimuth, self.plane_elevation, self.plane_offset)

    def _build_pins(self) -> None:
        form = self._group("Hizalama pimleri")
        self.pin_count = QSpinBox()
        self.pin_count.setRange(0, 12)
        self.pin_count.setValue(4)
        self.pin_diameter = _spin(1, 50, 5)
        self.pin_length = _spin(1, 50, 5)
        self.pin_clearance = _spin(0, 2, 0.2, 0.05)
        self.pin_clearance.setToolTip("Çap üzerinden boşluk: yuva Ø = pim Ø + boşluk.")
        self.pin_depth_clearance = _spin(0, 5, 0.5, 0.1)
        self.pin_positions = QLineEdit()
        self.pin_positions.setPlaceholderText("Otomatik  (elle: x, y; x, y — düzlem koordinatı)")
        form.addRow("Adet (otomatik):", self.pin_count)
        form.addRow("Çap:", self.pin_diameter)
        form.addRow("Boy:", self.pin_length)
        form.addRow("Çap boşluğu:", self.pin_clearance)
        form.addRow("Ek yuva derinliği:", self.pin_depth_clearance)
        form.addRow("Konumlar:", self.pin_positions)
        self._watch(
            self.pin_count,
            self.pin_diameter,
            self.pin_length,
            self.pin_clearance,
            self.pin_depth_clearance,
            self.pin_positions,
        )

    def _build_pouring(self) -> None:
        form = self._group("Döküm ağzı ve hava kanalları")
        self.pour_dir = QComboBox()
        for label, vec in PULL_DIRECTIONS.items():
            self.pour_dir.addItem(label, vec)
        self.spout_diameter = _spin(1, 100, 12)
        self.spout_position = QLineEdit()
        self.spout_position.setPlaceholderText("Otomatik  (elle: x, y, z)")
        self.vent_count = QSpinBox()
        self.vent_count.setRange(0, 20)
        self.vent_count.setValue(2)
        self.vent_diameter = _spin(0.5, 20, 3)
        self.vent_positions = QLineEdit()
        self.vent_positions.setPlaceholderText("Otomatik öneri  (elle: x, y, z; x, y, z)")
        form.addRow("Döküm yönü (yukarı):", self.pour_dir)
        form.addRow("Ağız çapı:", self.spout_diameter)
        form.addRow("Ağız konumu:", self.spout_position)
        form.addRow("Kanal adedi:", self.vent_count)
        form.addRow("Kanal çapı:", self.vent_diameter)
        form.addRow("Kanal konumları:", self.vent_positions)
        self._watch(
            self.pour_dir,
            self.spout_diameter,
            self.spout_position,
            self.vent_count,
            self.vent_diameter,
            self.vent_positions,
        )

    def _build_view(self) -> None:
        form = self._group("Görünüm")
        self.explode = QSlider(Qt.Horizontal)
        self.explode.setRange(0, 100)
        self.explode.setValue(20)
        self.explode.valueChanged.connect(lambda v: self.explode_changed.emit(float(v)))
        form.addRow("Patlatma aralığı:", self.explode)

    def _build_dimensions(self) -> None:
        form = self._group("Ölçüler (mm)")
        self.dim_object = QLabel("—")
        self.dim_cavity = QLabel("—")
        self.dim_outer = QLabel("—")
        form.addRow("Gerçek nesne:", self.dim_object)
        form.addRow("Boşluk:", self.dim_cavity)
        form.addRow("Dış gövde:", self.dim_outer)

    # ------------------------------------------------------------ behaviour
    def _edited(self) -> None:
        self._update_enabled()
        if not self._loading:
            self._debounce.start()

    def flush(self) -> None:
        """Emit a pending change immediately (before running an operation)."""
        if self._debounce.isActive():
            self._debounce.stop()
            self.changed.emit()

    def _apply_cast_defaults(self) -> None:
        if self._loading:
            return
        mode = CastMode(self.cast_mode.currentData())
        mold = MoldParams.for_cast_mode(mode)
        pour = PouringParams.for_cast_mode(mode)
        self._loading = True
        for box, value in (
            (self.margin_side, mold.margin_side),
            (self.margin_top, mold.margin_top),
            (self.margin_bottom, mold.margin_bottom),
            (self.min_wall, mold.min_wall_thickness),
            (self.spout_diameter, pour.spout_diameter),
            (self.vent_diameter, pour.vent_diameter),
        ):
            box.setValue(value)
        self.vent_count.setValue(pour.vent_count)
        self._loading = False
        self._edited()

    def _update_enabled(self) -> None:
        is_box = self.body_shape.currentData() == BodyShape.BOX
        for w in (self.box_x, self.box_y, self.box_z):
            w.setEnabled(is_box)
        for w in (self.margin_side, self.margin_top, self.margin_bottom):
            w.setEnabled(not is_box)
        mode_a = self.mode.currentData() == "A"
        self.pull_dir.setEnabled(mode_a)
        self.opening_auto.setEnabled(mode_a)
        self.opening_offset.setEnabled(mode_a and not self.opening_auto.isChecked())
        angled = self.plane_axis.currentText() == ANGLED
        for w in (self.plane_azimuth, self.plane_elevation):
            w.setEnabled(not mode_a and angled)
        for w in (
            self.plane_axis,
            self.plane_offset,
            self.pin_count,
            self.pin_diameter,
            self.pin_length,
            self.pin_clearance,
            self.pin_depth_clearance,
            self.pin_positions,
        ):
            w.setEnabled(not mode_a)

    def set_state(self, state: ProjectState) -> None:
        self._loading = True
        try:
            self._set_combo(self.cast_mode, state.cast_mode)
            m = state.mold
            self._set_combo(self.body_shape, m.body_shape)
            self.margin_side.setValue(m.margin_side)
            self.margin_top.setValue(m.margin_top)
            self.margin_bottom.setValue(m.margin_bottom)
            if m.box_size is not None:
                for box, v in zip((self.box_x, self.box_y, self.box_z), m.box_size, strict=True):
                    box.setValue(v)
            self.min_wall.setValue(m.min_wall_thickness)
            self.shrinkage.setValue(m.shrinkage_percent)
            self._set_combo(self.mode, state.mode)
            self._set_combo(self.pull_dir, tuple(state.pull_dir))
            self.opening_auto.setChecked(state.opening_offset is None)
            if state.opening_offset is not None:
                self.opening_offset.setValue(state.opening_offset)
            self.set_plane(state.plane)
            p = state.pins
            self.pin_count.setValue(p.count)
            self.pin_diameter.setValue(p.diameter)
            self.pin_length.setValue(p.length)
            self.pin_clearance.setValue(p.clearance)
            self.pin_depth_clearance.setValue(p.depth_clearance)
            self.pin_positions.setText(format_positions(state.pin_positions))
            q = state.pouring
            self._set_combo(self.pour_dir, tuple(q.pour_dir))
            self.spout_diameter.setValue(q.spout_diameter)
            self.spout_position.setText(
                format_positions([q.spout_position]) if q.spout_position else ""
            )
            self.vent_count.setValue(q.vent_count)
            self.vent_diameter.setValue(q.vent_diameter)
            self.vent_positions.setText(format_positions(q.vent_positions))
        finally:
            self._loading = False
        self._update_enabled()

    def set_plane(self, plane: PartingPlane) -> None:
        normal = plane.unit_normal()
        for axis, vec in PLANE_AXES.items():
            dot = sum(a * b for a, b in zip(vec, normal, strict=True))
            if abs(abs(dot) - 1) < 1e-9:
                # n = ±axis, so n·x = d is the same plane as axis·x = ±d.
                self.plane_axis.setCurrentText(axis)
                self.plane_offset.setValue(plane.offset * (1 if dot > 0 else -1))
                return
        self.plane_axis.setCurrentText(ANGLED)
        self.plane_azimuth.setValue(math.degrees(math.atan2(normal[1], normal[0])))
        self.plane_elevation.setValue(math.degrees(math.asin(max(-1.0, min(1.0, normal[2])))))
        self.plane_offset.setValue(plane.offset)

    def state_from_ui(self, base: ProjectState) -> ProjectState:
        """New state from the widgets; source fields are kept from `base`."""
        self.input_error = ""
        state = copy.deepcopy(base)
        state.cast_mode = CastMode(self.cast_mode.currentData())
        state.mold = MoldParams(
            body_shape=BodyShape(self.body_shape.currentData()),
            margin_side=self.margin_side.value(),
            margin_top=self.margin_top.value(),
            margin_bottom=self.margin_bottom.value(),
            box_size=(self.box_x.value(), self.box_y.value(), self.box_z.value())
            if self.body_shape.currentData() == BodyShape.BOX
            else None,
            min_wall_thickness=self.min_wall.value(),
            shrinkage_percent=self.shrinkage.value(),
            cylinder_sections=base.mold.cylinder_sections,
        )
        state.mode = str(self.mode.currentData())
        state.pull_dir = tuple(self.pull_dir.currentData())
        state.opening_offset = (
            None if self.opening_auto.isChecked() else self.opening_offset.value()
        )
        if self.plane_axis.currentText() == ANGLED:
            state.plane = PartingPlane.from_angles(
                self.plane_azimuth.value(), self.plane_elevation.value(), self.plane_offset.value()
            )
        else:
            state.plane = PartingPlane(
                PLANE_AXES[self.plane_axis.currentText()], self.plane_offset.value()
            )
        state.pins = dataclasses.replace(
            base.pins,
            count=self.pin_count.value(),
            diameter=self.pin_diameter.value(),
            length=self.pin_length.value(),
            clearance=self.pin_clearance.value(),
            depth_clearance=self.pin_depth_clearance.value(),
        )
        state.pin_positions = self._positions(
            self.pin_positions, 2, "Pim konumları", base.pin_positions
        )
        spout = self._positions(
            self.spout_position,
            3,
            "Döküm ağzı konumu",
            [base.pouring.spout_position] if base.pouring.spout_position else None,
        )
        state.pouring = dataclasses.replace(
            base.pouring,
            pour_dir=tuple(self.pour_dir.currentData()),
            spout_diameter=self.spout_diameter.value(),
            spout_position=spout[0] if spout else None,
            vent_count=self.vent_count.value(),
            vent_diameter=self.vent_diameter.value(),
            vent_positions=self._positions(
                self.vent_positions, 3, "Kanal konumları", base.pouring.vent_positions
            ),
        )
        return state

    def _positions(
        self, edit: QLineEdit, dims: int, label: str, fallback: list | None
    ) -> list | None:
        try:
            return parse_positions(edit.text(), dims)
        except ValueError:
            self.input_error = f"{label} okunamadı. Biçim: " + (
                "x, y; x, y" if dims == 2 else "x, y, z; x, y, z"
            )
            return fallback

    def set_dimensions(
        self,
        obj: tuple[float, ...] | None,
        cavity: tuple[float, ...] | None,
        outer: tuple[float, ...] | None,
    ) -> None:
        def fmt(d: tuple[float, ...] | None) -> str:
            return "—" if d is None else " × ".join(f"{v:.2f}" for v in d)

        self.dim_object.setText(fmt(obj))
        self.dim_cavity.setText(fmt(cavity))
        self.dim_outer.setText(fmt(outer))

    @staticmethod
    def _set_combo(combo: QComboBox, data: object) -> None:
        for i in range(combo.count()):
            if combo.itemData(i) == data:
                combo.setCurrentIndex(i)
                return
