import logging

from automold3d.core.logging_setup import LOG_FILE_NAME, setup_logging


def test_log_file_is_written(tmp_path):
    log_path = setup_logging(tmp_path)
    logging.getLogger("automold3d.test").info("hello log")
    for handler in logging.getLogger().handlers:
        handler.flush()
    assert log_path == tmp_path / LOG_FILE_NAME
    assert "hello log" in log_path.read_text(encoding="utf-8")


def test_setup_logging_is_idempotent(tmp_path):
    setup_logging(tmp_path)
    setup_logging(tmp_path)
    ours = [h for h in logging.getLogger().handlers if getattr(h, "_automold", False)]
    assert len(ours) == 2  # one file + one console handler
