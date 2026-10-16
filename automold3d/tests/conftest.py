import os
import sys

import pytest


def _has_display() -> bool:
    if sys.platform != "linux":
        return True
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def pytest_collection_modifyitems(config, items):
    if _has_display():
        return
    skip = pytest.mark.skip(reason="no display; run with `xvfb-run -a pytest`")
    for item in items:
        if "gui" in item.keywords:
            item.add_marker(skip)


def pytest_configure(config):
    config.addinivalue_line("markers", "gui: needs a display (Qt + OpenGL viewport)")
