import ast
from pathlib import Path

CORE_DIR = Path(__file__).resolve().parents[1] / "core"


def test_required_libraries_import():
    import manifold3d  # noqa: F401
    import PySide6  # noqa: F401
    import pyvista  # noqa: F401
    import trimesh  # noqa: F401


def test_core_does_not_import_qt():
    banned = ("PySide6", "PyQt5", "PyQt6", "qtpy", "pyvistaqt", "automold3d.ui")
    for path in CORE_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                continue
            for name in names:
                assert not name.startswith(banned), f"{path.name} imports {name}"
