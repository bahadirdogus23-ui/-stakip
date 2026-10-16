"""Parameter dataclasses. All lengths are in millimetres."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np

UNIT = "mm"


class CastMode(StrEnum):
    """What the mold is used for; only changes parameter defaults."""

    SILICONE_MOLD = "silicone_mold"
    CAST_INTO_MOLD = "cast_into_mold"


class BodyShape(StrEnum):
    """Outer mold body. AUTO_BOX = model bounding box + margins."""

    AUTO_BOX = "auto_box"
    BOX = "box"
    CYLINDER = "cylinder"


@dataclass
class MoldParams:
    """Outer body and cavity parameters.

    Margins are the distance from the model bounding box to the outer wall; min_wall_thickness
    is the smallest acceptable material thickness anywhere and is checked separately.
    """

    body_shape: BodyShape = BodyShape.AUTO_BOX
    margin_side: float = 10.0
    margin_top: float = 10.0
    margin_bottom: float = 10.0
    # Only for BodyShape.BOX: explicit outer size, centred on the model bounding box.
    box_size: tuple[float, float, float] | None = None
    min_wall_thickness: float = 5.0
    # Material shrinkage compensation in percent; the cavity is scaled by (1 + s/100).
    shrinkage_percent: float = 0.0
    draft_angle_deg: float = 0.0
    cylinder_sections: int = 128

    @classmethod
    def for_cast_mode(cls, mode: CastMode) -> MoldParams:
        if mode is CastMode.SILICONE_MOLD:
            # Margin = silicone thickness around the object.
            return cls(
                margin_side=10.0, margin_top=10.0, margin_bottom=10.0, min_wall_thickness=5.0
            )
        return cls(margin_side=6.0, margin_top=6.0, margin_bottom=6.0, min_wall_thickness=3.0)

    def validate(self) -> list[str]:
        """Turkish error messages; empty list means valid."""
        errors: list[str] = []
        for name, value in (
            ("Yan pay", self.margin_side),
            ("Üst pay", self.margin_top),
            ("Alt pay", self.margin_bottom),
        ):
            if value < 0:
                errors.append(f"{name} negatif olamaz.")
        if self.min_wall_thickness <= 0:
            errors.append("Minimum duvar kalınlığı sıfırdan büyük olmalı.")
        if not -50.0 < self.shrinkage_percent < 50.0:
            errors.append("Çekme payı -%50 ile %50 arasında olmalı.")
        if self.body_shape is BodyShape.BOX and self.box_size is None:
            errors.append("Kutu gövde için dış ölçüler girilmeli.")
        if self.box_size is not None and min(self.box_size) <= 0:
            errors.append("Kutu ölçüleri sıfırdan büyük olmalı.")
        if self.cylinder_sections < 16:
            errors.append("Silindir bölüm sayısı en az 16 olmalı.")
        return errors


@dataclass(frozen=True)
class PartingPlane:
    """Plane normal·x = offset. Normal need not be unit length; offset is along the unit normal."""

    normal: tuple[float, float, float] = (0.0, 0.0, 1.0)
    offset: float = 0.0

    def unit_normal(self) -> tuple[float, float, float]:
        n = np.asarray(self.normal, dtype=float)
        n = n / np.linalg.norm(n)
        return (float(n[0]), float(n[1]), float(n[2]))

    @classmethod
    def from_angles(cls, azimuth_deg: float, elevation_deg: float, offset: float) -> PartingPlane:
        """Normal from azimuth (around Z, from +X) and elevation (from the XY plane)."""
        az, el = np.radians(azimuth_deg), np.radians(elevation_deg)
        normal = (np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el))
        return cls((float(normal[0]), float(normal[1]), float(normal[2])), offset)


@dataclass
class PinParams:
    """Registration pins on one half, matching sockets in the other.

    clearance is on the diameter (socket Ø = pin Ø + clearance); depth_clearance is the
    extra socket depth so the pin never bottoms out.
    """

    diameter: float = 5.0
    length: float = 5.0
    clearance: float = 0.2
    depth_clearance: float = 0.5
    count: int = 4
    sections: int = 32

    @property
    def socket_diameter(self) -> float:
        return self.diameter + self.clearance

    @property
    def socket_depth(self) -> float:
        return self.length + self.depth_clearance

    def validate(self) -> list[str]:
        errors: list[str] = []
        if self.diameter <= 0 or self.length <= 0:
            errors.append("Pim çapı ve boyu sıfırdan büyük olmalı.")
        if self.clearance < 0 or self.depth_clearance < 0:
            errors.append("Pim boşlukları negatif olamaz.")
        if self.count < 0:
            errors.append("Pim sayısı negatif olamaz.")
        if self.sections < 8:
            errors.append("Pim bölüm sayısı en az 8 olmalı.")
        return errors


@dataclass
class PouringParams:
    """Pour spout and air vents. Both are off by default.

    pour_dir points "up" while casting: the spout and vents run from the cavity to the outer
    surface along it. Positions are world points on the cavity surface; None = automatic.
    """

    spout_enabled: bool = False
    spout_diameter: float = 10.0
    spout_position: tuple[float, float, float] | None = None
    vents_enabled: bool = False
    vent_diameter: float = 2.0
    vent_count: int = 2
    vent_positions: list[tuple[float, float, float]] | None = None
    pour_dir: tuple[float, float, float] = (0.0, 0.0, 1.0)
    sections: int = 32

    @classmethod
    def for_cast_mode(cls, mode: CastMode) -> PouringParams:
        if mode is CastMode.SILICONE_MOLD:
            return cls(spout_diameter=12.0, vent_diameter=3.0, vent_count=2)
        return cls(spout_diameter=15.0, vent_diameter=3.0, vent_count=4)

    def validate(self) -> list[str]:
        errors: list[str] = []
        if self.spout_diameter <= 0 or self.vent_diameter <= 0:
            errors.append("Döküm ağzı ve hava kanalı çapı sıfırdan büyük olmalı.")
        if self.vent_count < 0:
            errors.append("Hava kanalı sayısı negatif olamaz.")
        if self.sections < 8:
            errors.append("Kanal bölüm sayısı en az 8 olmalı.")
        return errors
