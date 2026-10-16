"""Project state, .amproj save/load, recent-projects list (SQLite) and undo/redo history."""

from __future__ import annotations

import copy
import dataclasses
import json
import logging
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import trimesh

from automold3d import __version__
from automold3d.core.errors import AutoMoldError
from automold3d.core.mesh_validation import ValidationReport
from automold3d.core.mold_generator import MoldResult
from automold3d.core.params import (
    UNIT,
    BodyShape,
    CastMode,
    MoldParams,
    PartingPlane,
    PinParams,
    PouringParams,
)
from automold3d.core.splitter import SplitResult

log = logging.getLogger(__name__)

PROJECT_SUFFIX = ".amproj"
PROJECT_FORMAT_VERSION = 1
HISTORY_LIMIT = 50
RECENT_LIMIT = 10


class ProjectError(AutoMoldError):
    """A project file could not be read or written."""


@dataclass
class ProjectState:
    """Everything the user chose. Serialised to .amproj; geometry is re-derived on load."""

    cast_mode: CastMode = CastMode.SILICONE_MOLD
    source_path: str | None = None
    source_sha256: str | None = None
    source_unit: str = UNIT
    repaired: bool = False
    mold: MoldParams = field(default_factory=MoldParams)
    mode: str = "B"
    pull_dir: tuple[float, float, float] = (0.0, 0.0, 1.0)
    opening_offset: float | None = None
    plane: PartingPlane = field(default_factory=PartingPlane)
    pins: PinParams = field(default_factory=PinParams)
    pin_positions: list[tuple[float, float]] | None = None
    pouring: PouringParams = field(default_factory=PouringParams)


@dataclass
class Session:
    """State plus derived geometry. Meshes are never mutated, so copies share them."""

    state: ProjectState = field(default_factory=ProjectState)
    model: trimesh.Trimesh | None = None
    validation: ValidationReport | None = None
    mold: MoldResult | None = None
    split: SplitResult | None = None
    label: str = ""

    def snapshot(self, label: str) -> Session:
        clone = copy.copy(self)
        clone.state = copy.deepcopy(self.state)
        clone.label = label
        return clone


class History:
    """Snapshot-based undo/redo of Sessions."""

    def __init__(self, initial: Session, limit: int = HISTORY_LIMIT) -> None:
        self._undo: list[Session] = []
        self._redo: list[Session] = []
        self._limit = limit
        self.current = initial

    def push(self, session: Session) -> None:
        self._undo.append(self.current)
        if len(self._undo) > self._limit:
            self._undo.pop(0)
        self._redo.clear()
        self.current = session

    def replace_current(self, session: Session) -> None:
        """Coalesce consecutive edits (e.g. parameter tweaks) into one undo step."""
        self._redo.clear()
        self.current = session

    def can_undo(self) -> bool:
        return bool(self._undo)

    def can_redo(self) -> bool:
        return bool(self._redo)

    def undo(self) -> Session:
        if not self._undo:
            raise ProjectError("Geri alınacak işlem yok.", "empty undo stack")
        self._redo.append(self.current)
        self.current = self._undo.pop()
        return self.current

    def redo(self) -> Session:
        if not self._redo:
            raise ProjectError("Yinelenecek işlem yok.", "empty redo stack")
        self._undo.append(self.current)
        self.current = self._redo.pop()
        return self.current

    @property
    def undo_label(self) -> str:
        return self.current.label if self._undo else ""

    @property
    def redo_label(self) -> str:
        return self._redo[-1].label if self._redo else ""


# ------------------------------------------------------------------ (de)serialisation


def state_to_dict(state: ProjectState) -> dict[str, object]:
    data = dataclasses.asdict(state)
    data["cast_mode"] = state.cast_mode.value
    data["mold"]["body_shape"] = state.mold.body_shape.value
    return data


def state_from_dict(data: dict[str, object]) -> ProjectState:
    try:
        mold = dict(data.get("mold", {}))  # type: ignore[arg-type]
        if "body_shape" in mold:
            mold["body_shape"] = BodyShape(mold["body_shape"])
        if mold.get("box_size") is not None:
            mold["box_size"] = tuple(mold["box_size"])
        plane = dict(data.get("plane", {}))  # type: ignore[arg-type]
        if "normal" in plane:
            plane["normal"] = tuple(plane["normal"])
        positions = data.get("pin_positions")
        return ProjectState(
            cast_mode=CastMode(data.get("cast_mode", CastMode.SILICONE_MOLD.value)),
            source_path=data.get("source_path"),  # type: ignore[arg-type]
            source_sha256=data.get("source_sha256"),  # type: ignore[arg-type]
            source_unit=str(data.get("source_unit", UNIT)),
            repaired=bool(data.get("repaired", False)),
            mold=MoldParams(**mold),
            mode=str(data.get("mode", "B")),
            pull_dir=tuple(data.get("pull_dir", (0.0, 0.0, 1.0))),  # type: ignore[arg-type]
            opening_offset=data.get("opening_offset"),  # type: ignore[arg-type]
            plane=PartingPlane(**plane),
            pins=PinParams(**dict(data.get("pins", {}))),  # type: ignore[arg-type]
            pin_positions=[tuple(p) for p in positions] if positions else None,  # type: ignore[union-attr]
            pouring=_pouring_from_dict(dict(data.get("pouring", {}))),  # type: ignore[arg-type]
        )
    except (TypeError, ValueError, KeyError) as exc:
        raise ProjectError("Proje dosyasındaki ayarlar okunamadı.", repr(exc)) from exc


def _pouring_from_dict(data: dict[str, object]) -> PouringParams:
    for key in ("pour_dir", "spout_position"):
        if data.get(key) is not None:
            data[key] = tuple(data[key])  # type: ignore[arg-type]
    if data.get("vent_positions") is not None:
        data["vent_positions"] = [tuple(p) for p in data["vent_positions"]]  # type: ignore[union-attr]
    return PouringParams(**data)  # type: ignore[arg-type]


def save_project(state: ProjectState, path: Path) -> Path:
    path = path.with_suffix(PROJECT_SUFFIX)
    payload = {
        "format": "automold3d-project",
        "version": PROJECT_FORMAT_VERSION,
        "app_version": __version__,
        "saved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "state": state_to_dict(state),
    }
    try:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
    except OSError as exc:
        raise ProjectError(f"Proje kaydedilemedi: {path}", repr(exc)) from exc
    log.info("Project saved: %s", path)
    return path


def load_project(path: Path) -> ProjectState:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ProjectError(f"Proje dosyası bulunamadı: {path}", repr(exc)) from exc
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ProjectError("Proje dosyası okunamadı veya bozuk.", repr(exc)) from exc
    if not isinstance(payload, dict) or payload.get("format") != "automold3d-project":
        raise ProjectError("Bu dosya bir AutoMold 3D projesi değil.", f"bad header in {path}")
    if int(payload.get("version", 0)) > PROJECT_FORMAT_VERSION:
        raise ProjectError("Proje daha yeni bir sürümle kaydedilmiş.", str(payload.get("version")))
    return state_from_dict(payload.get("state", {}))


# ------------------------------------------------------------------ recent projects


def default_config_dir() -> Path:
    override = os.environ.get("AUTOMOLD_CONFIG_DIR")
    if override:
        return Path(override)
    if sys.platform == "win32" and os.environ.get("APPDATA"):
        return Path(os.environ["APPDATA"]) / "AutoMold3D"
    return Path.home() / ".automold3d"


class RecentProjects:
    """Recently opened/saved project paths in a small SQLite database."""

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or default_config_dir() / "recent.sqlite"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS recent (path TEXT PRIMARY KEY, opened_at TEXT NOT NULL)"
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def add(self, path: Path) -> None:
        stamp = datetime.now(UTC).isoformat(timespec="microseconds")
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO recent(path, opened_at) VALUES(?, ?) "
                "ON CONFLICT(path) DO UPDATE SET opened_at = excluded.opened_at",
                (str(Path(path).resolve()), stamp),
            )
            conn.execute(
                "DELETE FROM recent WHERE path NOT IN "
                "(SELECT path FROM recent ORDER BY opened_at DESC LIMIT ?)",
                (RECENT_LIMIT,),
            )

    def list(self, only_existing: bool = True) -> list[Path]:
        with self._connect() as conn:
            rows = conn.execute("SELECT path FROM recent ORDER BY opened_at DESC").fetchall()
        paths = [Path(r[0]) for r in rows]
        return [p for p in paths if p.exists()] if only_existing else paths
