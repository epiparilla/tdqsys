@echo off
echo Stopping any existing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting the Background Video Server...
echo Keep this window open while testing!
node "C:\Users\Epi\Documents\Projects\AutoFocus\Autofocus cloud\video_server.js"
pause
