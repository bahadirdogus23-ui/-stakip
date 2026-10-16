"""Run geometry in a persistent child process.

A separate process keeps the UI responsive (no GIL contention with long numpy/manifold
calls) and makes cancel real: the child is terminated and restarted on the next call.
This module must not import Qt; the child process imports it.
"""

from __future__ import annotations

import logging
import multiprocessing as mp
import threading
from collections.abc import Callable
from multiprocessing.connection import Connection
from multiprocessing.reduction import ForkingPickler
from pathlib import Path

import numpy as np
import trimesh

from automold3d.core.errors import AutoMoldError

log = logging.getLogger(__name__)


class WorkerStopped(AutoMoldError):
    """The child process ended before returning a result (cancelled or crashed)."""


def _rebuild_mesh(vertices: np.ndarray, faces: np.ndarray) -> trimesh.Trimesh:
    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)


def _reduce_mesh(mesh: trimesh.Trimesh) -> tuple[object, tuple[np.ndarray, np.ndarray]]:
    # Send only the geometry; caches (normals, adjacency, ...) are rebuilt lazily.
    return _rebuild_mesh, (np.asarray(mesh.vertices), np.asarray(mesh.faces))


def register_mesh_reducer() -> None:
    ForkingPickler.register(trimesh.Trimesh, _reduce_mesh)


def _serve(conn: Connection, log_dir: str | None) -> None:
    from automold3d.core.logging_setup import setup_logging

    setup_logging(
        Path(log_dir) if log_dir else None, file_name="automold_worker.log", console=False
    )
    register_mesh_reducer()
    while True:
        try:
            message = conn.recv()
        except (EOFError, OSError):
            return
        if message is None:
            return
        fn, args = message
        try:
            result = (True, fn(*args))
        except Exception as exc:  # returned to the UI as a structured failure
            logging.getLogger(__name__).exception("Worker task %s failed", fn)
            result = (False, exc)
        try:
            conn.send(result)
        except Exception as exc:  # e.g. an unpicklable result
            conn.send((False, AutoMoldError("İşlem sonucu aktarılamadı.", repr(exc))))


class CancelToken:
    """Marks one call as cancelled, even if it has not reached the child yet."""

    def __init__(self) -> None:
        self.cancelled = False


class ProcessExecutor:
    """One child process, one call at a time. `kill()` may be called from any thread."""

    def __init__(self, log_dir: Path | None = None) -> None:
        self._log_dir = str(log_dir) if log_dir else None
        self._proc: mp.process.BaseProcess | None = None
        self._conn: Connection | None = None
        self._call_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._active_token: CancelToken | None = None
        register_mesh_reducer()

    def start(self) -> None:
        """Start the child if needed (non-blocking; imports happen in the child)."""
        with self._state_lock:
            self._start_locked()

    def _start_locked(self) -> None:
        if self._proc is not None and self._proc.is_alive():
            return
        ctx = mp.get_context("spawn")
        parent, child = ctx.Pipe()
        proc = ctx.Process(
            target=_serve, args=(child, self._log_dir), daemon=True, name="automold-worker"
        )
        proc.start()
        child.close()
        self._proc, self._conn = proc, parent
        log.info("Worker process started (pid %s)", proc.pid)

    def call(
        self, fn: Callable[..., object], args: tuple[object, ...], token: CancelToken | None = None
    ) -> object:
        with self._call_lock:
            with self._state_lock:
                if token is not None and token.cancelled:
                    raise WorkerStopped("İşlem iptal edildi.", "cancelled before start")
                self._start_locked()
                self._active_token = token
                conn = self._conn
            assert conn is not None
            try:
                conn.send((fn, args))
                ok, payload = conn.recv()
            except (EOFError, OSError, BrokenPipeError) as exc:
                self._reset()
                raise WorkerStopped(
                    "Hesaplama süreci durduruldu veya beklenmedik şekilde kapandı.", repr(exc)
                ) from exc
            finally:
                with self._state_lock:
                    self._active_token = None
        if not ok:
            raise payload  # type: ignore[misc]
        return payload

    def kill(self, token: CancelToken | None = None) -> None:
        """Cancel `token`'s call. If it is running, terminate the child (a fresh one starts on
        the next call); if it has not started yet, it will refuse to start."""
        with self._state_lock:
            if token is not None:
                token.cancelled = True
                if self._active_token is not token:
                    return
            proc, conn = self._proc, self._conn
            self._proc = self._conn = None
        if proc is not None:
            proc.terminate()
            proc.join(5)
            log.info("Worker process terminated")
        if conn is not None:
            conn.close()

    def shutdown(self) -> None:
        with self._state_lock:
            proc, conn = self._proc, self._conn
            self._proc = self._conn = None
        if conn is not None:
            try:
                conn.send(None)
            except (OSError, BrokenPipeError):
                pass
            conn.close()
        if proc is not None:
            proc.join(3)
            if proc.is_alive():
                proc.terminate()
                proc.join(3)

    def _reset(self) -> None:
        with self._state_lock:
            if self._proc is not None and not self._proc.is_alive():
                self._proc = self._conn = None
