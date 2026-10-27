@echo off
REM Yol Bakim programini tarayici izni gerektirmeden acar.
REM Kayit sunucusu kucuk bir pencerede calisir; program kullanildigi surece acik kalmalidir.
cd /d "%~dp0"
start "Yol Bakim - kayit sunucusu" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kantar_sunucu.ps1"
