@echo off
echo Launching TV Display on secondary screen...

REM --window-position=1920,0 places the window at the start of the secondary monitor
REM This assumes your primary monitor is 1920px wide (standard 1080p).
REM If your primary monitor is a different resolution, change 1920 to match its width.
REM Example: 2560 for a 1440p primary monitor, 3840 for a 4K primary monitor.

REM --app mode removes browser chrome (tabs/address bar) for a cleaner TV display
REM --start-fullscreen immediately goes fullscreen on launch
REM --autoplay-policy=no-user-gesture-required forcefully bypasses browser video blocks

start chrome --app="http://toyotaautofocus2026.local/display_with_ads.html" --start-fullscreen --autoplay-policy=no-user-gesture-required --window-position=1920,0
