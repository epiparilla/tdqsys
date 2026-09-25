# tdqsys Test Drive Queue System

## Overview

A real-time test drive queue management system for Toyota/Lexus dealerships. It displays vehicle queue numbers on a TV screen with automated video ad playback and text-to-speech (TTS) voice announcements. Facilitators manage queues from a dashboard on any device.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TOYOTA TDQSYS                         │
├──────────────┬──────────────┬───────────────────────────────┤
│   Frontend   │   Backend    │          Cloud                │
│              │              │                               │
│ dashboard    │ video_server │  Cloudflare Pages Workers     │
│ display      │   (Node.js)  │  (API + KV storage)           │
│ display_ads  │              │                               │
│ client       │ tts_server   │                               │
│              │   (Python)   │                               │
├──────────────┴──────────────┴───────────────────────────────┤
│  Ports: Node.js → 8081  │  TTS → 8001  │  Cloudflare → 443   │
└─────────────────────────────────────────────────────────────┘
```

### Three Layers

1. **Local Backend** (TV Laptop)
   - `video_server.js` — Node.js HTTP server on port 8081. Serves videos (HTTP 206 range), queue data API, and static frontend files. Acts as the offline hub.
   - `tts_server.py` — Python FastAPI server on port 8001. Uses Kokoro ONNX TTS model to generate voice announcements with zero-latency pre-cached audio splicing.

2. **Frontend Pages**
   - `dashboard.html` — Facilitator control panel (mobile-friendly). Increment/decrement queues per vehicle model, re-announce, reset all.
   - `display_with_ads.html` — TV display with stacked queue grid, auto video ad engine (random 5-10s intervals), TTS announcements, fullscreen support.
   - `display.html` — TV display without ad engine (simplified version).
   - `client.html` — Mobile-optimized status viewer (slow 30s polling).
   - `index.html` — Hub landing page.

3. **Cloud Sync** (Cloudflare Pages)
   - `functions/api/data.js` — GET queue state from KV namespace.
   - `functions/api/save.js` — POST queue state to KV namespace.
   - KV namespace `QUEUE_DATA` persists state across devices.

### Data Flow

- **Dashboard changes** → `localStorage` broadcast (instant, same machine) + `POST /api/save` to local server (port 80) → `data.json` file + Cloudflare sync watchdog pushes to cloud.
- **Display polls** → `GET /api/data` from local server every 2s + listens to `localStorage` for instant updates. Falls back to Cloudflare API if local is unreachable.
- **Cloudflare sync** — Video server checks connectivity every 10s. When internet restores after an outage, it pushes local data to cloud.

---

## Project Structure

```
tdqsys/
│
├── public/                          # Frontend files (deployed to Cloudflare Pages)
│   ├── index.html                   # Hub landing page
│   ├── dashboard.html               # Facilitator control panel
│   ├── display.html                 # Queue display (no ads)
│   ├── display_with_ads.html        # Full TV display + video ads + TTS
│   ├── client.html                  # Mobile status viewer
│   └── style.css                    # All styles
│
├── videos/                          # MP4 ad videos served by video_server.js
│   └── *.mp4
│
├── audio_cache/                     # Pre-rendered TTS clips (generated at first boot)
│   ├── numbers/                     # 00.wav - 150.wav
│   └── speakers/                    # Vehicle acronyms, prefix, suffix
│
├── functions/api/                   # Cloudflare Pages serverless functions
│   ├── data.js                      # GET /api/data (reads from KV)
│   └── save.js                      # POST /api/save (writes to KV)
│
├── tts_server.py                    # FastAPI TTS server (Kokoro ONNX, port 8001)
├── video_server.js                  # Node.js video + data server (port 80)
├── data.json                        # Local queue state backup
├── wrangler.toml                    # Cloudflare Wrangler configuration
│
├── kokoro-v1.0.int8.onnx            # Kokoro TTS ONNX model (~100MB)
├── voices-v1.0.bin                  # Kokoro voice embeddings
│
├── start_all_systems.vbs            # Boot script (starts both servers)
├── stop_all_systems.vbs             # Shutdown script (kills both servers)
├── launch_tv_display.bat            # Opens Chrome in kiosk mode on secondary monitor
├── setup_local_dns.bat              # Adds local DNS entry to hosts file
└── test_server.bat                  # Starts video_server.js in visible console
```

---

## Setting Up on a New Laptop

### Prerequisites

Install these **before** copying files:

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18+ (LTS) | https://nodejs.org/ |
| **Python** | 3.10+ | https://python.org/ |
| **Google Chrome** | Latest | https://google.com/chrome/ |
| **Cloudflare Wrangler** (optional) | Latest | `npm install -g wrangler` |

### Files/Folders to Copy

Copy the **entire `tdqsys` folder** to the new laptop. Everything listed below is required:

| Path | Required | Purpose |
|------|----------|---------|
| `public/` | **Yes** | All frontend HTML/CSS |
| `videos/` | **Yes** | MP4 ad files for the TV display |
| `audio_cache/` | Optional | Pre-rendered TTS clips. If missing, `tts_server.py` will regenerate them on first boot (~30 seconds). |
| `tts_server.py` | **Yes** | TTS engine |
| `video_server.js` | **Yes** | Video + data server |
| `data.json` | Optional | Current queue state. If missing, starts at all zeros (or seeds from cloud). |
| `kokoro-v1.0.int8.onnx` | **Yes** | TTS model file |
| `voices-v1.0.bin` | **Yes** | TTS voice data |
| `wrangler.toml` | **Yes** | Cloudflare config (needed for `wrangler deploy`) |
| `functions/` | **Yes** | Cloudflare Workers (needed for cloud deployment) |
| `start_all_systems.vbs` | **Yes** | Boot script |
| `stop_all_systems.vbs` | **Yes** | Shutdown script |
| `launch_tv_display.bat` | **Yes** | Opens TV display in kiosk mode |
| `setup_local_dns.bat` | **Yes** | Sets up local hostname |
| `test_server.bat` | Optional | Debug helper for video server |

### Step-by-Step Setup

#### 1. Install Dependencies

```powershell
# Python packages (for TTS server)
pip install fastapi uvicorn soundfile numpy kokoro_onnx

# Cloudflare Wrangler (only needed for cloud deployment)
npm install -g wrangler
```

#### 2. Configure Local DNS

Run **as Administrator**:

```powershell
.\setup_local_dns.bat
```

This adds `127.0.0.1 tdqsys.local` to your Windows hosts file, so the display can reach the local server via a consistent hostname even when offline.

#### 3. Start the Servers

Double-click `start_all_systems.vbs` or run:

```powershell
# Start video server (runs in background, invisible)
wscript start_all_systems.vbs
```

This will:
1. Kill any stale `node.exe` / `python.exe` processes
2. Start `video_server.js` on port 80 (invisible)
3. Start `tts_server.py` on port 8001 (visible console shows pre-rendering progress)
4. Wait 6 seconds, then open `http://tdqsys.local` in your browser

#### 4. Launch TV Display

```powershell
.\launch_tv_display.bat
```

Opens Chrome in app/kiosk mode on a secondary monitor (positioned at 1920,0) loading `display_with_ads.html`.

#### 5. Verify Everything Works

| Check | URL | Expected |
|-------|-----|----------|
| Video server | `http://localhost/api/data` | JSON with zeros or existing queue state |
| TTS server | `http://localhost:8001/api/speak_unit?unit=RH01` | WAV audio plays |
| Video playlist | `http://localhost/api/videos` | JSON array of MP4 URLs |
| Dashboard | `http://localhost/dashboard.html` | Control panel with +/- buttons |
| Display | `http://localhost/display_with_ads.html` | Stacked queue grid with "Click to start" overlay |

#### 6. (Optional) Deploy to Cloudflare

```powershell
cd "tdqsys"
wrangler pages deploy public
```

This uploads `public/` to Cloudflare Pages so facilitators can access the dashboard from mobile devices anywhere. The local server syncs with cloud automatically via its connectivity watchdog.

---

## Operating the System

### Daily Workflow

1. **Start**: Double-click `start_all_systems.vbs`
2. **Open display**: Double-click `launch_tv_display.bat` (or navigate to `http://tdqsys.local/display_with_ads.html`)
3. **Click anywhere** on the display to activate fullscreen and start the ad engine
4. **Manage queues**: Open `http://tdqsys.local/dashboard.html` on your phone/tablet
5. **Shutdown**: Double-click `stop_all_systems.vbs` at end of day

### Dashboard Controls

- **+/- buttons** — Increment or decrement queue count per vehicle model
- **Direct input** — Type a number and press Enter to set a specific value
- **Re-announce** — Speaker icon triggers a TTS re-announcement for that unit
- **Reset All to Zero** — Bottom-right red button with 2-step confirmation

### Display Behavior

- Queue grid shows Toyota (7 units) stacked above Lexus (4 units)
- Video ads play at random intervals (5-10 seconds between ads)
- TTS announces new queue numbers (skips zero values)
- Click anywhere on startup to bypass browser autoplay restrictions

### Offline Mode

If internet goes down:
- Local server (`video_server.js`) continues serving all pages and videos
- Queue data is backed up to `data.json` in real-time
- When internet restores, the watchdog automatically pushes local data to Cloudflare

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 80 already in use | Run `taskkill /F /IM node.exe` then restart |
| Port 8001 already in use | Run `taskkill /F /IM python.exe` then restart |
| TTS not speaking | Check `http://localhost:8001/docs` — verify server is running. First boot takes ~30s to pre-render audio. |
| Videos not playing | Ensure `.mp4` files are in the `videos/` folder. Check `http://localhost/api/videos` returns a list. |
| Dashboard not syncing | Open DevTools Console on both dashboard and display tabs. Check for fetch errors. Verify both access same hostname. |
| Cloudflare deploy fails | Run `wrangler login` first. Ensure KV namespace ID in `wrangler.toml` is valid. |
| Chrome kiosk opens on wrong monitor | Edit `launch_tv_display.bat` and adjust `--window-position=1920,0` to your monitor layout |

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Video/Data Server | Node.js (built-in `http`, `fs`, `https`, `path` modules, zero dependencies) |
| TTS Engine | Python + FastAPI + Kokoro ONNX + Uvicorn |
| TTS Model | Kokoro v1.0 (int8 quantized ONNX, ~100MB) |
| Cloud Hosting | Cloudflare Pages + Workers + KV |
| Frontend | Vanilla HTML/CSS/JS (no frameworks) |
| Sync Mechanism | localStorage (instant, same machine) + HTTP polling (cross-machine) |
