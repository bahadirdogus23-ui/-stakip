"""Export mold parts (STL/OBJ/3MF), a JSON report and a PNG snapshot.

STL has no unit metadata, so the unit is written into every filename and the report.
"""

from __future__ import annotations

import dataclasses
import json
import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path

import numpy as np
import trimesh

from automold3d import APP_NAME, __version__
from automold3d.core import geometry_checks as qa
from automold3d.core.errors import AutoMoldError, ModelImportError
from automold3d.core.importer import file_sha256, load_model
from automold3d.core.params import UNIT, MoldParams
from automold3d.core.splitter import MoldPart, SplitResult

log = logging.getLogger(__name__)

EXPORT_FORMATS = ("stl", "obj", "3mf")
REPORT_NAME = "kalip_raporu.json"
SNAPSHOT_NAME = "kalip_onizleme.png"
# Binary STL stores float32 coordinates; volumes may move by this much after a round trip.
ROUNDTRIP_VOLUME_TOL = 1e-5

PART_COLORS = ("#4c9be8", "#e8a34c", "#5cc48a", "#c45c9a", "#9a8be8", "#e85c5c")


class ExportError(AutoMoldError):
    """Files could not be written."""


@dataclass
class ExportedFile:
    part_id: int
    path: Path
    file_format: str
    face_count: int
    volume: float
    sha256: str


def part_filename(part: MoldPart, file_format: str) -> str:
    return f"{part.name}_{UNIT}.{file_format}"


def export_parts(
    parts: Sequence[MoldPart],
    out_dir: Path,
    formats: Iterable[str] = ("stl",),
    overwrite: bool = False,
) -> list[ExportedFile]:
    """Write each part in each format. Refuses to overwrite unless asked to."""
    formats = [f.lower() for f in formats]
    unknown = [f for f in formats if f not in EXPORT_FORMATS]
    if unknown:
        raise ExportError(f"Desteklenmeyen dışa aktarma biçimi: {', '.join(unknown)}", str(unknown))
    out_dir.mkdir(parents=True, exist_ok=True)
    targets = [(p, f, out_dir / part_filename(p, f)) for p in parts for f in formats]
    existing = [t[2].name for t in targets if t[2].exists()]
    if existing and not overwrite:
        raise ExportError(
            f"Bu dosyalar zaten var: {', '.join(existing)}. Üzerine yazmayı onaylayın.",
            f"existing files in {out_dir}",
        )
    written: list[ExportedFile] = []
    for part, file_format, path in targets:
        _write_mesh(part.mesh, path, file_format)
        written.append(
            ExportedFile(
                part.part_id,
                path,
                file_format,
                len(part.mesh.faces),
                float(part.mesh.volume),
                file_sha256(path),
            )
        )
        log.info("Exported %s (%d faces)", path, len(part.mesh.faces))
    return written


def _write_mesh(mesh: trimesh.Trimesh, path: Path, file_format: str) -> None:
    try:
        data = mesh.export(file_type=file_format)
        if isinstance(data, str):
            data = data.encode("utf-8")
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
    except OSError as exc:
        raise ExportError(f"Dosya yazılamadı: {path}", repr(exc)) from exc


def check_roundtrip(exported: ExportedFile) -> qa.CheckResult:
    """Re-import a written file: still watertight, same triangle count, same volume."""
    name = f"Dışa aktarma doğrulama: {exported.path.name}"
    try:
        mesh = load_model(exported.path).mesh
    except ModelImportError as exc:
        return qa.CheckResult(
            name, qa.CheckStatus.ERROR, f"Dosya geri okunamadı: {exc.user_message}"
        )
    problems = []
    if not mesh.is_watertight:
        problems.append("kapalı değil")
    if len(mesh.faces) != exported.face_count:
        problems.append(f"üçgen sayısı {exported.face_count} → {len(mesh.faces)}")
    volume = float(mesh.volume) if mesh.is_watertight else float("nan")
    rel = abs(volume - exported.volume) / max(abs(exported.volume), 1e-12)
    if not rel <= ROUNDTRIP_VOLUME_TOL:
        problems.append(f"hacim farkı %{rel * 100:.4f}")
    data = {"faces": len(mesh.faces), "volume": volume, "relative_volume_error": rel}
    if problems:
        return qa.CheckResult(
            name, qa.CheckStatus.ERROR, "Geri okumada sorun: " + ", ".join(problems), data
        )
    return qa.CheckResult(
        name, qa.CheckStatus.PASSED, "Geri okundu: kapalı, aynı üçgen ve hacim.", data
    )


def build_report(
    result: SplitResult,
    params: MoldParams,
    exported: Sequence[ExportedFile],
    extra_checks: Sequence[qa.CheckResult] = (),
    source_path: Path | None = None,
    source_sha256: str | None = None,
) -> dict[str, object]:
    checks = [*result.checks, *extra_checks]
    outer = _combined_bounds([p.mesh for p in result.parts])
    report: dict[str, object] = {
        "uygulama": f"{APP_NAME} {__version__}",
        "olusturma_zamani": datetime.now(UTC).isoformat(timespec="seconds"),
        "birim": UNIT,
        "kalip_modu": result.mode,
        "kaynak": {"dosya": str(source_path) if source_path else None, "sha256": source_sha256},
        "olculer_mm": {
            "nesne": _round(result.model.extents),
            "bosluk": _round(result.cavity_model.extents),
            "dis_govde": _round(outer[1] - outer[0]),
        },
        "hacimler_mm3": {
            "nesne": round(float(result.model.volume), 4),
            "bosluk": round(float(result.cavity_model.volume), 4),
            "parcalar": {str(p.part_id): round(float(p.mesh.volume), 4) for p in result.parts},
        },
        "parametreler": _jsonable(dataclasses.asdict(params)),
        "ayirma_duzlemleri": [
            {"normal": list(pl.unit_normal()), "ofset_mm": pl.offset} for pl in result.planes
        ],
        "pimler": _pins_report(result),
        "kanallar": [
            {
                "tur": "dokum_agzi" if c.kind == "spout" else "hava_kanali",
                "konum_mm": list(c.position),
                "cap_mm": c.diameter,
            }
            for c in result.channels
        ],
        "hava_kapani_onerileri": [
            {"konum_mm": list(t.point), "not": "öneri"} for t in result.air_traps
        ],
        "parca_bilgisi": [
            {
                "parca": i.part_id,
                "cikarma_yonu": list(i.pull_dir),
                "ters_aci_mm2": round(i.undercut_area, 3),
            }
            for i in result.part_info
        ],
        "montaj_sirasi": list(result.assembly_order),
        "ters_aci": {
            "alan_mm2": round(result.undercut.undercut_area, 3),
            "oran": round(result.undercut.undercut_fraction, 5),
        },
        "dosyalar": [
            {
                "parca": e.part_id,
                "dosya": e.path.name,
                "bicim": e.file_format,
                "ucgen": e.face_count,
                "hacim_mm3": round(e.volume, 4),
                "sha256": e.sha256,
            }
            for e in exported
        ],
        "kontroller": [{"ad": c.name, "durum": c.status.value, "mesaj": c.message} for c in checks],
        "uretime_hazir": qa.all_passed(checks),
        "sonuc": qa.readiness_message(checks),
        "not": "Hava kapanı/akış simülasyonu yapılmaz; öneriler yalnızca geometriye dayanır.",
    }
    return report


def write_report(report: dict[str, object], path: Path) -> Path:
    try:
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise ExportError(f"Rapor yazılamadı: {path}", repr(exc)) from exc
    return path


def exploded_offsets(parts: Sequence[MoldPart], gap: float) -> list[np.ndarray]:
    """Move each part away from the assembly centre by `gap` along its centroid direction."""
    centre = np.mean(_combined_bounds([p.mesh for p in parts]), axis=0)
    offsets = []
    for part in parts:
        direction = part.mesh.bounds.mean(axis=0) - centre
        norm = np.linalg.norm(direction)
        offsets.append(direction / norm * gap if norm > 1e-9 else np.zeros(3))
    return offsets


def render_snapshot(
    parts: Sequence[MoldPart],
    path: Path,
    model: trimesh.Trimesh | None = None,
    explode_gap: float = 15.0,
    window_size: tuple[int, int] = (1200, 900),
) -> Path:
    """Off-screen PNG of the exploded parts (and the positive model, if given)."""
    import pyvista as pv

    try:
        plotter = pv.Plotter(off_screen=True, window_size=list(window_size))
        plotter.set_background("white")
        for i, (part, offset) in enumerate(
            zip(parts, exploded_offsets(parts, explode_gap), strict=True)
        ):
            mesh = pv.wrap(part.mesh).translate(offset, inplace=False)
            plotter.add_mesh(
                mesh, color=PART_COLORS[i % len(PART_COLORS)], opacity=0.85, smooth_shading=False
            )
        if model is not None:
            plotter.add_mesh(pv.wrap(model), color="#d9d9d9", opacity=0.6)
        plotter.view_isometric()
        plotter.add_text(f"{len(parts)} parça, birim: mm", font_size=10, color="black")
        plotter.screenshot(str(path))
        plotter.close()
    except Exception as exc:  # VTK raises many types when no OpenGL context is available
        raise ExportError("Önizleme görüntüsü (PNG) oluşturulamadı.", repr(exc)) from exc
    return path


def export_all(
    result: SplitResult,
    params: MoldParams,
    out_dir: Path,
    formats: Iterable[str] = ("stl",),
    overwrite: bool = False,
    snapshot: bool = True,
    source_path: Path | None = None,
    source_sha256: str | None = None,
) -> tuple[dict[str, object], list[ExportedFile]]:
    """Parts + round-trip checks + report (+ PNG). Returns the report and written files."""
    exported = export_parts(result.parts, out_dir, formats, overwrite)
    roundtrip = [check_roundtrip(e) for e in exported]
    if snapshot:
        try:
            render_snapshot(result.parts, out_dir / SNAPSHOT_NAME, result.model)
        except ExportError as exc:
            log.warning("Snapshot failed: %s", exc.detail)
            roundtrip.append(
                qa.CheckResult("Önizleme PNG", qa.CheckStatus.MANUAL, exc.user_message)
            )
    report = build_report(result, params, exported, roundtrip, source_path, source_sha256)
    write_report(report, out_dir / REPORT_NAME)
    return report, exported


def _pins_report(result: SplitResult) -> dict[str, object] | None:
    layout = result.pins
    if layout is None:
        return None
    return {
        "cap_mm": layout.params.diameter,
        "boy_mm": layout.params.length,
        "cap_boslugu_mm": layout.params.clearance,
        "yuva_cap_mm": layout.params.socket_diameter,
        "yuva_derinlik_mm": layout.params.socket_depth,
        "konumlar": [
            {"xy": list(p.xy), "gecerli": p.valid, "neden": p.reason} for p in layout.placements
        ],
    }


def _combined_bounds(meshes: Sequence[trimesh.Trimesh]) -> np.ndarray:
    bounds = np.array([m.bounds for m in meshes])
    return np.array([bounds[:, 0].min(axis=0), bounds[:, 1].max(axis=0)])


def _round(values: Iterable[float]) -> list[float]:
    return [round(float(v), 4) for v in values]


def _jsonable(value: object) -> object:
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    if isinstance(value, Enum):
        return value.value
    return value
