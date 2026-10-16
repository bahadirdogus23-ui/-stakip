# PyInstaller spec for AutoMold 3D (one-folder build).
# Build:  python -m PyInstaller --noconfirm --clean packaging/AutoMold3D.spec
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []
for package in ("vtkmodules", "pyvista", "pyvistaqt", "manifold3d", "trimesh"):
    d, b, h = collect_all(package)
    datas += d
    binaries += b
    hiddenimports += h
hiddenimports += collect_submodules("automold3d")
hiddenimports += ["scipy.spatial", "lxml", "networkx", "qtpy"]

a = Analysis(
    ["../automold3d/main.py"],
    pathex=[".."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "IPython", "pytest", "PyQt5", "PyQt6", "PySide2",
              "PySide6.QtWebEngineCore", "PySide6.QtWebEngineWidgets", "PySide6.Qt3DCore"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="AutoMold3D",
    console=False,
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="AutoMold3D")
