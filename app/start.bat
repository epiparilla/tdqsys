@echo off
rem AutoFocus Queue System - portable dev launcher (no installer needed during polish)
rem Ports are offset so this NEW project can run side-by-side with the ORIGINAL
rem (original keeps 80/8000; this one uses 8081/8001). See "Start Both Systems.bat".
cd /d "%~dp0"
if "%AF_PORT%"=="" set AF_PORT=8081
if "%AF_TTS_PORT%"=="" set AF_TTS_PORT=8001
echo Starting AutoFocus desktop app (engine :%AF_PORT%, voice :%AF_TTS_PORT%)...
npx electron .
pause