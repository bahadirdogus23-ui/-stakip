"""Rotating file + console logging for the whole application."""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_FILE_NAME = "automold.log"
LOG_DIR_ENV = "AUTOMOLD_LOG_DIR"
_MAX_BYTES = 2 * 1024 * 1024
_BACKUP_COUNT = 5
_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"


def default_log_dir() -> Path:
    """Return `<project root>/logs`, overridable with AUTOMOLD_LOG_DIR."""
    override = os.environ.get(LOG_DIR_ENV)
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "logs"


def setup_logging(log_dir: Path | None = None, level: int = logging.INFO) -> Path:
    """Configure the root logger once and return the log file path."""
    target_dir = log_dir or default_log_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    log_path = target_dir / LOG_FILE_NAME

    root = logging.getLogger()
    root.setLevel(level)
    for handler in list(root.handlers):
        if getattr(handler, "_automold", False):
            root.removeHandler(handler)
            handler.close()

    file_handler = RotatingFileHandler(
        log_path, maxBytes=_MAX_BYTES, backupCount=_BACKUP_COUNT, encoding="utf-8"
    )
    console_handler = logging.StreamHandler()
    for handler in (file_handler, console_handler):
        handler.setFormatter(logging.Formatter(_FORMAT))
        handler._automold = True  # type: ignore[attr-defined]
        root.addHandler(handler)
    return log_path
