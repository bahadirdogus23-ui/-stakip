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
where py >nul 2>&1 && (
  py -3.12 -c "import sys" >nul 2>&1 && set "PY=py -3.12"
)
if not defined PY where py >nul 2>&1 && (
  py -3.13 -c "import sys" >nul 2>&1 && set "PY=py -3.13"
)
if not defined PY (
  python -c "import sys; sys.exit(0 if sys.version_info[:2] in ((3, 12), (3, 13)) else 1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo [HATA] Python 3.12 veya 3.13 bulunamadi.
  echo.
  echo Bu bilgisayarda bulunan Python surumleri:
  py -0 2>nul
  python --version 2>nul
  echo.
  echo Cozum: https://www.python.org/downloads/ adresinden Python 3.12 kurun.
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
