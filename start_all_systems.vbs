Set WshShell = CreateObject("WScript.Shell")

' Kill stale node and python processes silently to ensure a clean boot
WshShell.Run "taskkill /F /IM node.exe", 0, True
WshShell.Run "taskkill /F /IM python.exe", 0, True

' Wait 1 second to release ports
WScript.Sleep 1000

' Start the Node Video/Data server invisibly
WshShell.Run "node ""C:\Users\Epi\Documents\Projects\AutoFocus\Autofocus cloud\video_server.js""", 0, False

' Start the Python TTS server visibly so the user can see when it finishes pre-rendering
WshShell.Run "cmd.exe /c cd ""C:\Users\Epi\Documents\Projects\AutoFocus\Autofocus cloud"" && python tts_server.py", 1, False

' Give the servers 6 seconds to boot and pre-render the AI voice models
WScript.Sleep 6000

' Open the dashboard automatically in the default browser
WshShell.Run "http://toyotaautofocus2026.local"
