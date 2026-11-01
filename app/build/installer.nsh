; Files are copied into resources before electron-builder invokes customInstall.
; Driver setup is independent of TDQSYS uninstall: never remove system drivers.
!macro customInstall
  DetailPrint "Checking NIIMBOT printer driver..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\drivers\install-niimbot-driver.ps1" -InstallerPath "$INSTDIR\resources\drivers\NiimbotPrinterDriverInstaller-3.0.2.1.exe"'
  Pop $0
  ${If} $0 == 3010
    SetRebootFlag true
  ${ElseIf} $0 != 0
    DetailPrint "NIIMBOT driver setup was not completed. TDQSYS remains installed; driver setup can be retried from resources\drivers."
    IfSilent +2
      MessageBox MB_OK|MB_ICONEXCLAMATION "NIIMBOT driver setup was not completed. TDQSYS is installed. You can run the bundled driver setup later from the TDQSYS resources\drivers folder."
  ${EndIf}
!macroend
