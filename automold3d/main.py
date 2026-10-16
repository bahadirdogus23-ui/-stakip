"""Application entry point: `python -m automold3d.main`."""

from __future__ import annotations

import logging
import sys
import traceback
from types import TracebackType

from automold3d import APP_NAME
from automold3d.core.logging_setup import setup_logging

log = logging.getLogger(__name__)


def _install_excepthook() -> None:
    """Log uncaught exceptions and show a Turkish message instead of crashing silently."""

    def hook(exc_type: type[BaseException], exc: BaseException, tb: TracebackType | None) -> None:
        details = "".join(traceback.format_exception(exc_type, exc, tb))
        log.critical("Uncaught exception:\n%s", details)
        from PySide6.QtWidgets import QApplication, QMessageBox

        if QApplication.instance() is not None:
            QMessageBox.critical(
                None,
                "Beklenmeyen hata",
                "Beklenmeyen bir hata oluştu. Ayrıntılar logs/automold.log dosyasına yazıldı.\n\n"
                f"{exc_type.__name__}: {exc}",
            )

    sys.excepthook = hook


def main() -> int:
    import multiprocessing

    multiprocessing.freeze_support()  # geometry worker process in frozen (PyInstaller) builds
    if "--version" in sys.argv:
        from automold3d import __version__

        print(f"{APP_NAME} {__version__}")
        return 0
    log_path = setup_logging()
    if "--self-test" in sys.argv:
        from automold3d.self_test import run_self_test

        return run_self_test()
    log.info("Starting %s, log file: %s", APP_NAME, log_path)
    _install_excepthook()

    from PySide6.QtWidgets import QApplication

    from automold3d.ui.main_window import MainWindow

    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    window = MainWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
