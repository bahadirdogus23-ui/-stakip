"""Model import. The source file is only ever read, never written."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import trimesh

from automold3d.core.errors import ModelImportError

log = logging.getLogger(__name__)

REQUIRED_FORMATS = {".stl": "stl", ".obj": "obj", ".3mf": "3mf"}
OPTIONAL_FORMATS = {".ply": "ply"}
STEP_EXTENSIONS = (".step", ".stp")

# Conversion factors from a unit to millimetres.
UNIT_TO_MM: dict[str, float] = {"mm": 1.0, "cm": 10.0, "m": 1000.0, "inch": 25.4}
_TRIMESH_UNIT_NAMES = {
    "millimeter": "mm",
    "millimeters": "mm",
    "mm": "mm",
    "centimeter": "cm",
    "centimeters": "cm",
    "cm": "cm",
    "meter": "m",
    "meters": "m",
    "m": "m",
    "inch": "inch",
    "inches": "inch",
    "in": "inch",
}

# Size heuristics (largest dimension, in file units) that trigger a unit warning.
_SUSPICIOUS_SMALL = 1.0
_SUSPICIOUS_LARGE = 2000.0


@dataclass
class ImportResult:
    """A loaded model in *file units*. Call `to_mm` once the user confirmed the unit."""

    mesh: trimesh.Trimesh
    source_path: Path
    source_sha256: str
    file_format: str
    detected_unit: str | None
    warnings: list[str] = field(default_factory=list)

    @property
    def dimensions(self) -> np.ndarray:
        return np.asarray(self.mesh.extents, dtype=float)


def step_supported() -> bool:
    """STEP import needs the optional CadQuery package."""
    return importlib.util.find_spec("cadquery") is not None


def supported_extensions() -> list[str]:
    exts = [*REQUIRED_FORMATS, *OPTIONAL_FORMATS]
    if step_supported():
        exts.extend(STEP_EXTENSIONS)
    return exts


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_model(path: str | Path) -> ImportResult:
    """Read a mesh file into memory and parse it. Raises ModelImportError on failure."""
    source = Path(path)
    ext = source.suffix.lower()
    if ext in STEP_EXTENSIONS:
        raise ModelImportError(
            "STEP içe aktarma bu kurulumda kullanılamıyor (CadQuery yüklü değil).",
            f"STEP file {source}",
        )
    file_type = REQUIRED_FORMATS.get(ext) or OPTIONAL_FORMATS.get(ext)
    if file_type is None:
        raise ModelImportError(
            f"Desteklenmeyen dosya türü: '{ext or '(uzantı yok)'}'. "
            "Desteklenenler: STL, OBJ, 3MF, PLY.",
            f"unsupported extension {ext!r} for {source}",
        )
    if not source.is_file():
        raise ModelImportError(f"Dosya bulunamadı: {source}", "missing file")

    data = source.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    if not data.strip():
        raise ModelImportError("Dosya boş.", f"empty file {source}")

    loaded = _parse(data, file_type, source)
    detected_unit = _detect_unit(loaded)
    mesh = _to_single_mesh(loaded, source)
    result = ImportResult(
        mesh=mesh,
        source_path=source,
        source_sha256=sha256,
        file_format=file_type,
        detected_unit=detected_unit,
    )
    result.warnings.extend(_unit_warnings(mesh, detected_unit))
    log.info(
        "Imported %s: %d faces, extents=%s, unit=%s",
        source,
        len(mesh.faces),
        np.round(mesh.extents, 4).tolist(),
        detected_unit,
    )
    return result


def to_mm(mesh: trimesh.Trimesh, unit: str) -> trimesh.Trimesh:
    """Return a copy scaled from `unit` to millimetres. Only called after user confirmation."""
    if unit not in UNIT_TO_MM:
        raise ModelImportError(f"Bilinmeyen birim: {unit}", f"unit {unit!r}")
    converted = mesh.copy()
    factor = UNIT_TO_MM[unit]
    if factor != 1.0:
        converted.apply_scale(factor)
    return converted


def _parse(data: bytes, file_type: str, source: Path) -> trimesh.Trimesh | trimesh.Scene:
    try:
        # process=True only merges duplicate vertices; validate=False keeps every face.
        loaded = trimesh.load(io.BytesIO(data), file_type=file_type, process=True, validate=False)
    except Exception as exc:  # trimesh raises many unrelated exception types
        raise ModelImportError(
            "Dosya okunamadı; bozuk veya beklenen biçimde değil.",
            f"{type(exc).__name__}: {exc} while parsing {source}",
        ) from exc
    return loaded


def _detect_unit(loaded: trimesh.Trimesh | trimesh.Scene) -> str | None:
    units = getattr(loaded, "units", None) or loaded.metadata.get("units")
    if not units:
        return None
    return _TRIMESH_UNIT_NAMES.get(str(units).lower())


def _to_single_mesh(loaded: trimesh.Trimesh | trimesh.Scene, source: Path) -> trimesh.Trimesh:
    if isinstance(loaded, trimesh.Scene):
        meshes = [g for g in loaded.dump() if isinstance(g, trimesh.Trimesh)]
        mesh = trimesh.util.concatenate(meshes) if meshes else None
    elif isinstance(loaded, trimesh.Trimesh):
        mesh = loaded
    else:
        mesh = None
    if mesh is None or len(mesh.faces) == 0:
        raise ModelImportError(
            "Dosyada üçgen yüzey bulunamadı.", f"no triangles in {source} ({type(loaded)})"
        )
    if not np.isfinite(mesh.vertices).all():
        raise ModelImportError(
            "Modelde geçersiz (NaN/sonsuz) koordinatlar var.", f"non-finite vertices in {source}"
        )
    return mesh


def _unit_warnings(mesh: trimesh.Trimesh, detected_unit: str | None) -> list[str]:
    warnings: list[str] = []
    largest = float(np.max(mesh.extents))
    if detected_unit is None:
        warnings.append("Dosyada birim bilgisi yok; birimi onaylayın (varsayılan: mm).")
    if largest < _SUSPICIOUS_SMALL:
        warnings.append(f"Model çok küçük (en büyük boyut {largest:.4g}). Birim metre olabilir mi?")
    elif largest > _SUSPICIOUS_LARGE:
        warnings.append(f"Model çok büyük (en büyük boyut {largest:.4g}). Birimi kontrol edin.")
    return warnings
