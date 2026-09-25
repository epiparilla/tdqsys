@echo off
rem AutoFocus Queue System - portable dev launcher (no installer needed during polish)
cd /d "%~dp0"
echo Starting AutoFocus desktop app...
npx electron .
pause