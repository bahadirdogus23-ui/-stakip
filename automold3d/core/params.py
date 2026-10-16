"""Parameter dataclasses. All lengths are in millimetres."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

UNIT = "mm"


class CastMode(StrEnum):
    """What the mold is used for; only changes parameter defaults."""

    SILICONE_MOLD = "silicone_mold"
    CAST_INTO_MOLD = "cast_into_mold"


@dataclass
class ProjectSettings:
    """Project-wide settings stored in the .amproj file."""

    cast_mode: CastMode = CastMode.SILICONE_MOLD
    unit: str = UNIT
