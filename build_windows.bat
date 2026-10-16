@echo off
REM Builds a Windows one-folder package into dist\AutoMold3D (needs Python 3.12).
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  py -3.12 -m venv .venv || goto :error
)
.venv\Scripts\python.exe -m pip install --upgrade pip || goto :error
.venv\Scripts\python.exe -m pip install -r requirements-build.txt || goto :error
.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean packaging\AutoMold3D.spec || goto :error
echo.
echo Paket hazir: dist\AutoMold3D\AutoMold3D.exe
exit /b 0

:error
echo Paketleme basarisiz oldu. Ayrintilar yukarida.
pause
exit /b 1
