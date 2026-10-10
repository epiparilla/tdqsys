# Task 3 — macOS port

**Status:** ON HOLD — parked at user request
**Depends on:** `tests/` harness green as baseline (Phase 1)

## Goal

Run a full TDQSYS location on a Mac. Static assets and `video_server.js` /
`tts_server.py` need no changes — the work is `app/main.js` plus packaging.

## Scope decided

- **Run a full location on a Mac** (engine + TTS + video ads), not view-only
- Build via **GitHub Actions macOS runner** — no local Mac
- Test on **MacinCloud**
- Signing **deferred** until proven
- Arch: **both / universal** — needs two TTS binaries selected by `process.arch`

## Biggest risk: espeakng-loader on arm64 macOS

`onnxruntime` has arm64 macOS wheels. **`espeakng-loader` may not.** If it
cannot build, the whole macOS-location goal changes shape. This is why Phase 0
exists and why it touches no shared code.

## Good news — already correct, do not touch

| Component | Status |
|---|---|
| `video_server.js` (367 lines) | Zero shell-outs, no ffmpeg, all `path.join` |
| `tts_server.py` | No subprocess, no backslashes, `model_dir()` portable |
| `preload.js` / `webPreferences` | `nodeIntegration:false`, `contextIsolation:true` |
| Engine launch | `process.resourcesPath` + `ELECTRON_RUN_AS_NODE=1` |
| `extraResources {from:"server",to:"server"}` | Lands in `Contents/Resources/server` |
| `asar: true` + `!node_modules/**/*` | **Zero native modules.** Nothing to rebuild |
| Model/voice assets | Tracked in git, platform-neutral |

## Verified blockers

| File | Issue | Fix |
|---|---|---|
| `app/main.js:405` | `spawn('cmd.exe')` with **no `'error'` handler** → unhandled error **crashes** main process on macOS | add `helper.on('error')` |
| `app/main.js:94` | `win.setMenu(null)`, no `Menu.setApplicationMenu()` → ⌘Q and ⌘C/⌘V break | real menu, **gated to darwin** so Windows keeps `setMenu(null)` |
| `app/main.js:33-35` | `tts_server.exe` hardcoded → TTS silently never starts | resolve per platform / per arch |
| `app/main.js:46-58` | `findUninstaller()` uses `Program Files` → null on mac → "portable" misreport | gate to win32 |
| `app/main.js:411-487` | PowerShell/`netsh` firewall → infinite retry loop every launch | skip on non-win32 |
| `app/main.js:642-692` | `taskkill` / `netstat -ano` | `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` + `process.kill` |
| `app/main.js:340-409` | Auto-updater entirely NSIS/`cmd.exe`/PowerShell | `{ok:false, reason:'unsupported'}` on darwin |
| `app/main.js:760-872` | `Compress-Archive`/`Expand-Archive` | `ditto -c -k` + `unzip` |
| `app/main.js:151` | `python` → does not exist on macOS | `python3`; add `'error'` handlers to engine/TTS spawns |
| `app/assemble-server.ps1:17` | literal `dist\tts_server.exe` | replace with `scripts/assemble-server.js` (Node, cross-platform) |
| `app/package.json:11-14` | `powershell`, `--win` only | `assemble-server.js`, add `--mac` scripts |
| `app/package.json:20-62` | no `mac` block | dmg, arm64+x64, hardenedRuntime, entitlements+entitlementsInherit, category, icon |
| assets | no `.icns`; best source `lazytech.png` is **500×500**, macOS wants **1024×1024** | **new artwork needed** — upscaling will look soft |
| `app/icon.png` 32×32 | unusable as app icon; not a `Template` image | proper macOS menu-bar icon |

Entitlements need `disable-library-validation` or the nested unsigned
PyInstaller `tts_server` dies under hardened runtime.

## Hard logistics

- **A `.dmg` cannot be built on Windows.** Needs macOS (CI runner).
- `audio_cache_seed` (1.6 MB, 50 WAVs) is **untracked** — CI would ship an
  incomplete bundle. Must be committed.
- TTS assets (`kokoro-v1.0.int8.onnx` 92 MB, `voices-v1.0.bin` 28 MB) **are**
  tracked — CI can fetch them.

## Phases

| # | Work | Gate |
|---|---|---|
| **0** | TTS spike on macOS runner: build `tts_server` and prove it **speaks** | Failure here → change approach before touching `main.js` |
| **1** | Test harness | Green on 1.1.15 |
| **2** | Platform guards in `main.js` — additive `darwin` branches only | Harness green; Windows menu behaviour asserted unchanged; staged-tree diff clean |
| **3** | Build pipeline: `assemble-server.js`, mac block, entitlements, per-arch artifacts | **Highest Windows risk** (runs every build) — `payload` test green |
| **4** | Assets: `icon.icns` from a **new 1024×1024** source, menu-bar `Template` icon | New files only |
| **5** | macOS CI matrix (`macos-14` arm64 / `macos-13` x64), unsigned dmgs | Artifacts produced |
| **6** | Real-Mac QA on MacinCloud: audio, LAN phone access + Local Network permission, video ads, external-display fullscreen, ⌘V paste, backup/restore | — |
| **7** | Developer ID + notarization | Deferred until 6 passes |

## Signing — deferred, but decide early

For **clients' machines** (not our own), there is no zero-friction path. macOS
Gatekeeper exists to stop unsigned apps from others.

| Approach | Cost | Client experience |
|---|---|---|
| Developer ID + notarized | $99/yr | Drag to Applications, done |
| Developer ID, not notarized | $99/yr | Blocked → right-click Open, **every version re-triggers** |
| Unsigned | $0 | Same block, no stable identity |
| Unsigned + MDM | $0 | MDM pre-approves; un-enrolled Macs still prompt |
| Unsigned + AirDrop/USB/SMB copy | $0 | **Works silently** — quarantine is set by the *downloading* app, not by AirDrop/file shares |
| Unsigned + `xattr -rd com.apple.quarantine` | $0 | One Terminal command per version |

Sequoia has progressively shrunk the bypass affordances, so a $0 route carries
maintenance risk. Recommend proving the location first, then signing.