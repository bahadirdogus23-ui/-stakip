"""Run long core operations off the UI thread so the UI never freezes.

Each task gets a QThread that waits on the geometry child process (ProcessExecutor), so
the UI thread never competes for the GIL. Cancel terminates the child process.
"""

from __future__ import annotations

import itertools
import logging
from collections.abc import Callable
from dataclasses import dataclass

from PySide6.QtCore import QObject, Qt, QThread, Signal, Slot

from automold3d.process_executor import CancelToken, ProcessExecutor

log = logging.getLogger(__name__)


class _Job(QObject):
    done = Signal(int, bool, object)  # job id, ok, result or exception

    def __init__(
        self,
        job_id: int,
        executor: ProcessExecutor,
        fn: Callable[..., object],
        args: tuple[object, ...],
    ) -> None:
        super().__init__()
        self.job_id = job_id
        self.executor = executor
        self.fn = fn
        self.args = args
        self.token = CancelToken()

    @Slot()
    def run(self) -> None:
        try:
            result = self.executor.call(self.fn, self.args, self.token)
        except Exception as exc:  # reported to the UI as a structured failure
            if self.token.cancelled:
                log.info("Background job %d stopped after cancel", self.job_id)
            else:
                log.exception("Background job %d failed", self.job_id)
            self.done.emit(self.job_id, False, exc)
            return
        self.done.emit(self.job_id, True, result)


@dataclass
class _Running:
    name: str
    thread: QThread
    job: _Job
    cancelled: bool = False


class TaskRunner(QObject):
    """One active task at a time; abandoned (cancelled) tasks finish silently."""

    succeeded = Signal(str, object)
    failed = Signal(str, object)
    busy_changed = Signal(bool, str)

    def __init__(
        self, parent: QObject | None = None, executor: ProcessExecutor | None = None
    ) -> None:
        super().__init__(parent)
        self.executor = executor or ProcessExecutor()
        self.executor.start()  # warm up: the child imports the geometry stack now
        self._ids = itertools.count(1)
        self._jobs: dict[int, _Running] = {}
        self._active: int | None = None

    @property
    def busy(self) -> bool:
        return self._active is not None

    def start(self, name: str, fn: Callable[..., object], args: tuple[object, ...] = ()) -> bool:
        """fn must be a module-level function; fn and args are pickled to the child."""
        if self.busy:
            return False
        job_id = next(self._ids)
        thread = QThread()
        job = _Job(job_id, self.executor, fn, args)
        job.moveToThread(thread)
        thread.started.connect(job.run)
        # quit() must run in the worker thread itself, otherwise _on_done's wait() deadlocks.
        job.done.connect(thread.quit, Qt.DirectConnection)
        job.done.connect(self._on_done)
        self._jobs[job_id] = _Running(name, thread, job)
        self._active = job_id
        self.busy_changed.emit(True, name)
        log.info("Task started: %s (#%d)", name, job_id)
        thread.start()
        return True

    def cancel(self) -> None:
        if self._active is None:
            return
        running = self._jobs[self._active]
        running.cancelled = True
        self.executor.kill(running.job.token)
        log.info("Task cancelled by user: %s (#%d)", running.name, self._active)
        self._active = None
        self.busy_changed.emit(False, "")

    def wait_all(self, timeout_ms: int = 60_000) -> None:
        """Block until every thread ended (used on shutdown and in tests)."""
        for running in list(self._jobs.values()):
            running.thread.wait(timeout_ms)

    def shutdown(self) -> None:
        if self.busy:
            self.cancel()
        self.wait_all(10_000)
        self.executor.shutdown()

    @Slot(int, bool, object)
    def _on_done(self, job_id: int, ok: bool, payload: object) -> None:
        running = self._jobs.pop(job_id, None)
        if running is None:
            return
        running.thread.wait()
        running.thread.deleteLater()
        running.job.deleteLater()
        if running.cancelled:
            log.info("Discarded result of cancelled task %s", running.name)
            return
        self._active = None
        self.busy_changed.emit(False, "")
        if ok:
            self.succeeded.emit(running.name, payload)
        else:
            self.failed.emit(running.name, payload)
