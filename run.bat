@echo off
REM AutoMold 3D launcher: first run creates .venv and installs packages, then starts the app.
REM Every failure keeps this window open with a Turkish (ASCII) explanation.
setlocal
cd /d "%~dp0"
title AutoMold 3D

if not exist "automold3d\main.py" (
  echo [HATA] Program dosyalari bu klasorde bulunamadi.
  echo ZIP dosyasini once sag tik ^> "Tumunu ayikla" ile bir klasore cikarin,
  echo sonra cikan klasordeki run.bat dosyasini calistirin.
  goto :fail
)

if exist ".venv\.installed" goto :run

set "PY="
REM Supported: Python 3.12, 3.13 and 3.14 (newest first).
for %%V in (3.14 3.13 3.12) do (
  if not defined PY (
    py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
  )
)
if not defined PY (
  python -c "import sys; sys.exit(0 if (3, 12) <= sys.version_info[:2] <= (3, 14) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
  REM No usable Python: install Python 3.13 for this user with winget (Windows 10/11).
  where winget >nul 2>&1 && (
    echo Python bulunamadi. Python 3.13 otomatik kuruluyor ^(winget^)...
    winget install -e --id Python.Python.3.13 --scope user --accept-package-agreements --accept-source-agreements
  )
  if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PY="%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
)
if not defined PY (
  echo [HATA] Uygun Python bulunamadi ^(3.12, 3.13 veya 3.14 gerekli^).
  echo.
  echo Bu bilgisayarda bulunan Python surumleri:
  py -0 2>nul
  python --version 2>nul
  echo.
  echo Cozum: https://www.python.org/downloads/ adresinden en son Python 3 surumunu kurun.
  echo Kurulumun ilk ekraninda "Add python.exe to PATH" kutusunu isaretleyin.
  echo Kurulumdan sonra bu pencereyi kapatip run.bat'i yeniden calistirin.
  goto :fail
)

echo Python bulundu: %PY%
echo Ilk kurulum yapiliyor. Internet gerekir, 5-10 dakika surebilir...
echo.
if not exist ".venv\Scripts\python.exe" (
  %PY% -m venv .venv
  if errorlevel 1 (
    echo [HATA] Sanal ortam ^(.venv^) olusturulamadi.
    goto :fail
  )
)
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [HATA] Paketler yuklenemedi. Internet baglantinizi kontrol edip tekrar deneyin.
  echo Sorun surerse yukaridaki kirmizi/ERROR satirlarinin ekran goruntusunu gonderin.
  goto :fail
)
type nul > ".venv\.installed"
echo.
echo Kurulum tamamlandi.

:run
echo AutoMold 3D baslatiliyor... (bu pencereyi program acikken kapatmayin)
".venv\Scripts\python.exe" -m automold3d.main %*
if errorlevel 1 (
  echo.
  echo [HATA] Program bir hatayla kapandi.
  echo Ayrintilar: %~dp0logs\automold.log
  goto :fail
)
exit /b 0

:fail
echo.
echo Bu pencereyi kapatmadan once ekran goruntusunu alin.
pause
exit /b 1
