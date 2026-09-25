Set WshShell = CreateObject("WScript.Shell")

' Kill stale node and python processes silently to ensure a clean boot
WshShell.Run "taskkill /F /IM node.exe", 0, True
WshShell.Run "taskkill /F /IM python.exe", 0, True
