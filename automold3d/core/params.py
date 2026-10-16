"""Parameter dataclasses. All lengths are in millimetres."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

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


@dataclass
class ProjectSettings:
    """Project-wide settings stored in the .amproj file."""

    cast_mode: CastMode = CastMode.SILICONE_MOLD
    unit: str = UNIT
    mold: MoldParams = field(default_factory=MoldParams)
