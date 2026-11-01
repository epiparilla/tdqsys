param(
    [string]$InstallerPath,
    [switch]$DetectOnly
)
$ErrorActionPreference = 'Stop'

function Test-NiimbotDriverInstalled {
    # Print-driver registrations are machine-wide and shared across registry views.
    # Check both driver generations and Windows architectures, even with no
    # connected USB device or configured print queue.
    foreach ($architecture in @('Windows x64', 'Windows NT x86', 'Windows ARM64')) {
        foreach ($generation in @('Version-3', 'Version-4')) {
            $driverRoot = "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Environments\$architecture\Drivers\$generation"
            foreach ($driver in @(Get-ChildItem -LiteralPath $driverRoot -ErrorAction SilentlyContinue)) {
                if ($driver.PSChildName -match '^NIIMBOT(?:\s|$)') { return $true }
            }
        }
    }
    # Some vendor versions also register the complete driver package here.
    foreach ($root in @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
    )) {
        foreach ($entry in @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)) {
            $package = Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
            if ($package.DisplayName -match '^NIIMBOT\s*(?:Printer\s*)?Driver') { return $true }
        }
    }
    return $false
}

if (Test-NiimbotDriverInstalled) {
    Write-Output 'NIIMBOT printer driver is already installed; skipping vendor setup.'
    exit 0
}
if ($DetectOnly) {
    Write-Output 'NIIMBOT printer driver is not installed.'
    exit 1
}
if (-not $InstallerPath -or -not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
    Write-Output 'Bundled NIIMBOT driver installer is missing.'
    exit 2
}
try {
    # Vendor setup is interactive so the operator can choose their printer model.
    # Elevate only this signed vendor setup; TDQSYS remains a per-user install.
    $setup = Start-Process -FilePath $InstallerPath -Verb RunAs -WindowStyle Normal -Wait -PassThru
    if ($setup.ExitCode -eq 3010) { exit 3010 }
    if ($setup.ExitCode -ne 0) { exit 3 }
    if (-not (Test-NiimbotDriverInstalled)) {
        Write-Output 'Vendor setup closed without registering an NIIMBOT driver.'
        exit 4
    }
    Write-Output 'NIIMBOT printer driver installed.'
    exit 0
} catch {
    Write-Output 'NIIMBOT driver setup could not complete or elevation was cancelled.'
    exit 5
}
