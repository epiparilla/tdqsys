# TDQSYS — Project Summary

**TDQSYS** is a real-time, offline-first test drive queue management and showroom display system designed for automotive dealerships (such as Toyota and Lexus). It orchestrates queue counters across multiple vehicle models, delivers automated commercial video playback on TV displays, provides natural text-to-speech (TTS) voice announcements, and mirrors live queue states to the cloud for mobile customer viewing.

---

## 1. High-Level Architecture

The system operates across three synchronized tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                               TDQSYS                                   │
├──────────────────┬──────────────────────┬──────────────────────────────┤
│  Frontend Pages  │  Local Engine (Host) │  Cloud Mirror (Edge)         │
│  (Vanilla HTML5) │  (Node.js + Python)  │  (Cloudflare Pages / KV)     │
│                  │                      │                              │
│ • dashboard.html │ • video_server.js    │ • functions/api/data.js      │
│ • display_ads    │   (Port 80/8081)     │ • functions/api/save.js      │
│ • client.html    │ • tts_server.py      │ • KV namespace (QUEUE_DATA)  │
│ • settings.html  │   (Port 8001 Kokoro) │                              │
└──────────────────┴──────────────────────┴──────────────────────────────┘
```

1. **Local Engine & Video Server**: Driven by `video_server.js` (Node.js HTTP server, zero external npm dependencies). Serves HTTP 206 range-request video streaming, manages local state storage in `data.json`, and coordinates cloud synchronization.
2. **Local TTS Engine**: Powered by `tts_server.py` (FastAPI + Kokoro v1.0 8-bit quantized ONNX model). Generates natural voice announcements with pre-rendered zero-latency audio splicing.
3. **Desktop Shell**: An Electron wrapper (`app/main.js`) that manages process lifecycles, detects secondary displays/TVs, configures system tray menus, and provides NSIS installer / portable builds.
4. **Cloud Mirror**: Deployed on Cloudflare Pages (`tdqsys.pages.dev`) with Cloudflare Workers in `functions/api/` and KV storage for remote mobile viewing.

---

## 2. Core Modules & User Interfaces

- **Facilitator Dashboard (`public/dashboard.html`)**:
  Mobile-friendly control board allowing staff to increment, decrement, set exact queue counts, and trigger voice announcements per vehicle model.
- **Showroom TV Display (`public/display_with_ads.html`)**:
  Full-screen TV interface with dual-brand stacked grid boards, automated randomized video ad playback engine (interstitials every 5–10s), and real-time audio announcements.
- **Customer Mobile Viewer (`public/client.html`)**:
  Low-bandwidth mobile view for visitors waiting for their test drive. Resolves location instances via QR code deep-links (`?id=<instanceId>`).
- **Settings & First-Run Wizard (`public/settings.html`)**:
  Allows complete dynamic configuration of brands, vehicle acronyms, ad timings, and cloud parameters. Includes safety unlock confirmation modals (`CONFIRM`), QR export in PNG/SVG formats, and licensing management.
- **Central Navigation Hub (`public/index.html`)**:
  Dual-purpose root index dynamically filtering out local hardware management links when hosted on public Cloudflare Pages.

---

## 3. Engineering Highlights & Resilience

- **Offline-First & Auto-Healing Sync**:
  Local operations continue uninterrupted if WAN connectivity drops. `video_server.js` runs a background watchdog that immediately reconciles local states with Cloudflare KV once internet is restored.
- **Instance Isolation (`instanceId`)**:
  Queue state sync is strictly scoped to an immutable `instanceId` (`public/af.js`). Multiple dealership locations running TDQSYS can share the same Cloudflare deployment without state collisions.
- **Cryptographic Offline Licensing**:
  Licensed via Ed25519 asymmetric signatures (`license.js` & `tools/license.js`). Does not require any activation server or phone-home telemetry. Features anti-clock-rollback tamper detection via monotonic timestamps.
- **Secure Desktop Execution**:
  Hardened Electron configuration in `app/main.js` with `contextIsolation: true` and `nodeIntegration: false`. In-app updates check sha/byte integrity against GitHub release assets defined in `public/version.json`.

---

## 4. Test Suite & Verification

The project includes an in-tree, zero-dependency test suite executed using Node's built-in `node:test` runner (`tests/run.js`):
- **Status**: 205 passing tests, 1 skipped.
- **Coverage**: Engine API, Cloudflare functions mock, license verification & cryptographic guards, unlock safety mechanisms, QR rendering, Electron security settings, and source code regressions.

---

## 5. Key Documentation & Reference Files

- `README.md` — Comprehensive installation and operation guide.
- `AGENTS.md` — Developer and agent operational notes, build commands, and deployment caveats.
- `LICENSING.md` — Manual license generation and key ceremony guidelines.
- `package.json` & `app/package.json` — Build and dependency manifests.
