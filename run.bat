@echo off
REM Creates the virtual environment on first run, then starts AutoMold 3D.
cd /d "%~dp0"
if not exist .venv\.installed (
  if not exist .venv\Scripts\python.exe py -3.12 -m venv .venv || goto :error
  .venv\Scripts\python.exe -m pip install --upgrade pip || goto :error
  .venv\Scripts\python.exe -m pip install -r requirements.txt || goto :error
  type nul > .venv\.installed
)
.venv\Scripts\python.exe -m automold3d.main %*
exit /b %errorlevel%

:error
echo Kurulum basarisiz oldu. Python 3.12 kurulu mu? (https://www.python.org/downloads/)
pause
exit /b 1
