@echo off
REM Kirsal Yol Bakim sunucusunu baslatir. Python 3 yuklu olmalidir (python.org).
REM Sifreyi asagida degistirin; cihazlarda Ayarlar > Sunucu sifresi alanina ayni sifreyi girin.
set KYB_TOKEN=degistir-bunu
set KYB_PORT=8080
cd /d "%~dp0server"
start "" http://localhost:%KYB_PORT%/
python server.py
pause
