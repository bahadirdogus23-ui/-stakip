"""Post-operation QA checks. Every check returns a CheckResult with a Turkish message."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum

import numpy as np
import trimesh

from automold3d.core.mold_body import BodySpec

# Relative tolerance for volume balance checks.
VOLUME_BALANCE_TOL = 0.005


class CheckStatus(StrEnum):
    PASSED = "BAŞARILI"
    WARNING = "UYARI"
    ERROR = "HATA"
    MANUAL = "MANUEL İNCELEME"


@dataclass
class CheckResult:
    name: str
    status: CheckStatus
    message: str
    data: dict[str, object] = field(default_factory=dict)


@dataclass
class WallThickness:
    minimum: float
    location: tuple[float, float, float]


def all_passed(results: Sequence[CheckResult]) -> bool:
    """True only if every check passed; required before calling a mold 'üretime hazır'."""
    return bool(results) and all(r.status is CheckStatus.PASSED for r in results)


def has_errors(results: Sequence[CheckResult]) -> bool:
    return any(r.status is CheckStatus.ERROR for r in results)


def readiness_message(results: Sequence[CheckResult]) -> str:
    if all_passed(results):
        return "Tüm kontroller geçti: üretime hazır."
    if has_errors(results):
        return "Hatalar var: kalıp üretime hazır DEĞİL."
    return "Uyarılar veya manuel inceleme gereken noktalar var; üretime hazır sayılmaz."


def check_not_empty(mesh: trimesh.Trimesh | None, label: str) -> CheckResult:
    name = f"Boş geometri: {label}"
    if mesh is None or len(mesh.faces) == 0:
        return CheckResult(name, CheckStatus.ERROR, f"{label} boş.")
    return CheckResult(name, CheckStatus.PASSED, f"{label}: {len(mesh.faces)} üçgen.")


def check_watertight(mesh: trimesh.Trimesh, label: str) -> CheckResult:
    name = f"Kapalı/geçerli: {label}"
    if mesh.is_watertight and mesh.is_winding_consistent:
        return CheckResult(name, CheckStatus.PASSED, f"{label} kapalı ve tutarlı.")
    return CheckResult(name, CheckStatus.ERROR, f"{label} kapalı (su geçirmez) değil.")


def check_volume_computable(mesh: trimesh.Trimesh, label: str) -> CheckResult:
    name = f"Hacim: {label}"
    if mesh.is_watertight and mesh.is_winding_consistent and mesh.volume > 0:
        return CheckResult(
            name,
            CheckStatus.PASSED,
            f"{label} hacmi {mesh.volume:.2f} mm³.",
            {"volume": float(mesh.volume)},
        )
    return CheckResult(name, CheckStatus.ERROR, f"{label} hacmi hesaplanamıyor.")


def check_part_count(parts: Sequence[trimesh.Trimesh], expected: int) -> CheckResult:
    name = "Parça sayısı"
    if len(parts) == expected:
        return CheckResult(name, CheckStatus.PASSED, f"{expected} parça üretildi.")
    return CheckResult(name, CheckStatus.ERROR, f"{expected} parça bekleniyordu, {len(parts)} var.")


def check_volume_balance(
    body_volume: float, model_volume: float, mold_volume: float
) -> CheckResult:
    """vol(mold) must equal vol(body) - vol(model): the cavity is a true negative."""
    name = "Negatif boşluk hacmi"
    expected = body_volume - model_volume
    error = abs(mold_volume - expected) / max(expected, 1e-12)
    data = {"expected": expected, "actual": mold_volume, "relative_error": error}
    if error <= VOLUME_BALANCE_TOL:
        return CheckResult(
            name,
            CheckStatus.PASSED,
            f"Kalıp hacmi gövde − model ile uyumlu (sapma %{error * 100:.3f}).",
            data,
        )
    return CheckResult(
        name, CheckStatus.ERROR, f"Kalıp hacmi beklenenden farklı (sapma %{error * 100:.2f}).", data
    )


def check_cavity_enclosed(mold: trimesh.Trimesh, model_volume: float) -> CheckResult:
    """A closed mold has one outer shell plus one inner shell per enclosed model component."""
    name = "Boşluk kapalı"
    shells = mold.split(only_watertight=False)
    inner = [s for s in shells if s.volume < 0]
    inner_volume = -sum(float(s.volume) for s in inner)
    rel = abs(inner_volume - model_volume) / max(model_volume, 1e-12)
    data = {"inner_shells": len(inner), "inner_volume": inner_volume}
    if inner and rel <= VOLUME_BALANCE_TOL:
        return CheckResult(
            name,
            CheckStatus.PASSED,
            f"Boşluk gövdenin içinde kapalı ({len(inner)} iç yüzey).",
            data,
        )
    if not inner:
        return CheckResult(
            name, CheckStatus.WARNING, "Boşluk dışarıya açık (açık kalıp) veya bulunamadı.", data
        )
    return CheckResult(
        name, CheckStatus.ERROR, f"İç boşluk hacmi modelden farklı (sapma %{rel * 100:.2f}).", data
    )


def measure_min_wall(model: trimesh.Trimesh, body: BodySpec) -> WallThickness:
    """Exact minimum distance from the model surface to the outer wall.

    For planar faces against box/cylinder walls the minimum is always at a vertex.
    """
    vertices = np.asarray(model.vertices, dtype=float)
    distances = body.inside_distance(vertices)
    idx = int(np.argmin(distances))
    v = vertices[idx]
    return WallThickness(float(distances[idx]), (float(v[0]), float(v[1]), float(v[2])))


def check_min_wall(model: trimesh.Trimesh, body: BodySpec, min_wall: float) -> CheckResult:
    name = "Minimum duvar kalınlığı"
    wall = measure_min_wall(model, body)
    data = {"minimum": wall.minimum, "location": wall.location, "limit": min_wall}
    loc = ", ".join(f"{c:.1f}" for c in wall.location)
    if wall.minimum < 0:
        return CheckResult(
            name, CheckStatus.ERROR, f"Model dış gövdenin dışına taşıyor (konum: {loc}).", data
        )
    if wall.minimum < min_wall:
        return CheckResult(
            name,
            CheckStatus.WARNING,
            f"En ince duvar {wall.minimum:.2f} mm < sınır {min_wall:.2f} mm (konum: {loc}).",
            data,
        )
    return CheckResult(
        name,
        CheckStatus.PASSED,
        f"En ince duvar {wall.minimum:.2f} mm (sınır {min_wall:.2f} mm).",
        data,
    )
