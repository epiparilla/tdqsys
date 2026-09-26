# Assemble app/server/ staging dir (engine, site, TTS exe + models) that
# electron-builder copies into resources/server/ for the installed build.
$root = Split-Path -Parent $PSScriptRoot   # app/ -> tdqsys/
$stage = Join-Path $PSScriptRoot 'server'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Copy-Item (Join-Path $root 'video_server.js')      $stage
New-Item -ItemType Directory -Path (Join-Path $stage 'shared') -Force | Out-Null
Copy-Item (Join-Path $root 'shared\config.js')     (Join-Path $stage 'shared')
Copy-Item (Join-Path $root 'public')               (Join-Path $stage 'public') -Recurse
Remove-Item (Join-Path $stage 'public\.wrangler') -Recurse -Force -ErrorAction SilentlyContinue
# downloads/ = installer/portable binaries for the update-check page; they are
# deployed to the Cloudflare site but must NOT ship inside the desktop app.
Remove-Item (Join-Path $stage 'public\downloads') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $root 'dist\tts_server.exe')  $stage
Copy-Item (Join-Path $root 'kokoro-v1.0.int8.onnx') $stage
Copy-Item (Join-Path $root 'voices-v1.0.bin')      $stage
if (Test-Path (Join-Path $root 'audio_cache_seed')) {
    Copy-Item (Join-Path $root 'audio_cache_seed') (Join-Path $stage 'audio_cache_seed') -Recurse
}

Write-Output "server staged at $stage"
Get-ChildItem $stage | ForEach-Object { Write-Output "  $($_.Name) $($_.Mode)" }
(Get-ChildItem $stage -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB | ForEach-Object { Write-Output ("total: {0:N1} MB" -f $_) }