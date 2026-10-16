"""Session-level operations used by the UI. Each returns a new Session (never mutates)."""

from __future__ import annotations

import copy
import logging
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

import trimesh

from automold3d.core import geometry_checks as qa
from automold3d.core.demold_analysis import PlaneScore, suggest_parting_planes
from automold3d.core.errors import GeometryError
from automold3d.core.exporter import ExportedFile, export_all
from automold3d.core.importer import ImportResult, load_model, to_mm
from automold3d.core.mesh_validation import repair_mesh, validate_mesh
from automold3d.core.mold_generator import generate_mold
from automold3d.core.project_manager import ProjectState, Session
from automold3d.core.splitter import one_part_open, two_part

log = logging.getLogger(__name__)


@dataclass
class AnalysisResult:
    session: Session
    suggestions: list[PlaneScore]


def import_model(path: Path, unit: str, state: ProjectState | None = None) -> Session:
    """Load, convert to mm with the unit the user confirmed, validate."""
    return session_from_import(load_model(path), unit, state)


def session_from_import(
    source: ImportResult, unit: str, state: ProjectState | None = None
) -> Session:
    model = to_mm(source.mesh, unit)
    new_state = ProjectState() if state is None else copy.deepcopy(state)
    new_state.source_path = str(Path(source.source_path).resolve())
    new_state.source_sha256 = source.source_sha256
    new_state.source_unit = unit
    new_state.repaired = False
    session = Session(
        state=new_state,
        # The file-unit mesh is not kept: it would double the data sent to the worker.
        model=model,
        validation=validate_mesh(model, check_self_intersection=False),
    )
    return session.snapshot("Model içe aktarma")


def repair(session: Session) -> Session:
    model = _require_model(session)
    result = repair_mesh(model)
    out = session.snapshot("Model onarma")
    out.model = result.mesh
    out.validation = validate_mesh(result.mesh, check_self_intersection=False)
    out.state.repaired = True
    out.mold = out.split = None
    log.info("Repair: %s", result.actions)
    return out


def analyze(session: Session, suggest: bool = True) -> AnalysisResult:
    """Full validation (incl. self-intersection) and parting-plane suggestions."""
    model = _require_model(session)
    out = session.snapshot("Model analizi")
    out.validation = validate_mesh(model, check_self_intersection=True)
    suggestions: list[PlaneScore] = []
    if suggest and out.validation.is_watertight and out.validation.volume:
        suggestions = suggest_parting_planes(model)
        out.state.plane = suggestions[0].plane
    return AnalysisResult(out, suggestions)


def build_mold(session: Session) -> Session:
    """Mode A: open one-part mold. Mode B: closed negative mold, ready to split."""
    model = _require_model(session)
    state = session.state
    out = session.snapshot("Negatif kalıp oluşturma")
    if state.mode == "A":
        out.mold = None
        out.split = one_part_open(model, state.mold, state.pull_dir, state.opening_offset)
    else:
        out.mold = generate_mold(model, state.mold)
        out.split = None
    return out


def split(session: Session, with_pins: bool = False) -> Session:
    if session.state.mode != "B":
        raise GeometryError("Bölme yalnızca iki parçalı kalıp (Mod B) için geçerli.", "mode A")
    if session.mold is None:
        raise GeometryError("Önce negatif kalıbı oluşturun.", "no mold")
    state = session.state
    out = session.snapshot("Pim ekleme" if with_pins else "Kalıbı bölme")
    out.split = two_part(
        session.mold,
        state.plane,
        state.mold,
        state.pins if with_pins else None,
        state.pin_positions if with_pins else None,
    )
    return out


def current_checks(session: Session) -> list[qa.CheckResult]:
    if session.split is not None:
        return list(session.split.checks)
    if session.mold is not None:
        return list(session.mold.checks)
    return []


def export(
    session: Session, out_dir: Path, formats: Iterable[str], overwrite: bool, snapshot: bool = True
) -> tuple[dict[str, object], list[ExportedFile]]:
    if session.split is None:
        raise GeometryError(
            "Dışa aktarılacak kalıp parçası yok; önce kalıbı oluşturup bölün.", "no split result"
        )
    state = session.state
    path = Path(state.source_path) if state.source_path else None
    return export_all(
        session.split, state.mold, out_dir, formats, overwrite, snapshot, path, state.source_sha256
    )


def _require_model(session: Session) -> trimesh.Trimesh:
    if session.model is None:
        raise GeometryError("Önce bir model içe aktarın.", "no model")
    return session.model
