# Task 1 — Cloud mirror migration to Firebase Realtime Database

**Status:** PARKED — decided, ready to build when scheduled
**Depends on:** `tests/` harness green as baseline
**Blocks:** nothing

## Why

The Cloudflare free tier **failed daily during a 4-day event**. That was one
location. Two locations at the stated client volume:

| | Event (1 loc) | 2 locations |
|---|---|---|
| Writes | hit 1,000/day cap mid-day | ~2,200/day = **220% of cap** |
| Reads (24 viewers @ 2s) | — | ~1,036,800/day = **1,036% of cap** |

The booth kept working while the online numbers silently went wrong — the worst
failure mode, because the feature looks fine until someone checks it.

## Decision

Firebase Realtime Database on **Blaze** + connection hygiene. Full board view
retained on the phone.

## Architecture

```
Cloudflare Pages (free, unmetered CDN) — unchanged
├── client.html, af.js, style.css, index.html, settings.html, 404.html
├── version.json                      ← auto-updater, untouched
└── functions/api/save.js             ← WRITE PROXY
    holds Firebase Admin credential as a Wrangler secret
        ▲                                ▲
        │ desktop app POSTs              │ engine POSTs (standalone mode)
        │ ~2,200/day                      │
 ───────┴────────────────────────────────┴──────
Firebase Realtime Database (Blaze)
└── /instances/<uuid>/state           ← mirror; local data.json is the MASTER
        ▲
        │ WebSocket subscribe — ZERO Cloudflare requests
   customers' browsers
```

Two properties:

- **Reads never touch Cloudflare.** The 100k/day Worker ceiling and the KV read
  ceiling stop existing.
- **Writes stay low-volume** (~2,200/day), far inside the free 100k limit.
  **No paid Cloudflare plan required — this ends at $0/month.**

**Note:** there are TWO writers to update — `pushState()` in `app/main.js` and
`pushToCloud()` in `video_server.js` (the latter gated by `AF_OWNER_SYNC`).

## De-risker

**Firebase is a mirror, not the master.** `data.json` stays authoritative.

| Event | Impact |
|---|---|
| Firebase outage | Online viewer degrades; **booth unaffected** |
| Firebase data loss | Desktop re-pushes full state next tick; **booth unaffected** |
| Need for Firebase backups | **None** — we mirror something we already have |

## Security model

| Path | Auth |
|---|---|
| Read | **Public** — scanning the QR must never hit a login |
| Write | Shared secret, verified in the Function (constant-time) |

Firebase rules: **allow reads, deny all direct client writes.** Only write path
is the Function using the Admin SDK, credential in a Wrangler secret — **never
inside the desktop binary.**

Secret lives in each location's `data.json` (so backups carry it), entered in
Settings. Closes today's hole where the instance UUID alone grants write access
and UUIDs escape via texts and photos of printed signs.

> **Simplification chosen:** single shared write secret entered on each PC, not
> per-instance tokens. Per-instance blast radius is over-engineering for two
> locations under one owner. Upgradeable later.

## Quota verification

| Limit | Our load | Spark allowance | Blaze |
|---|---|---|---|
| **Operations** | ~2,200 writes/day | Unmetered | Unmetered |
| **Connections** | 4 typical / 24 worst | 100 — 24% | **200,000** |
| Storage | ~6 KB | 1 GB | 1 GB free |
| Download | 158 MB/day | 360 MB/day | same, then $1/GB |
| Workers (write proxy) | ~2,200/day | 100k/day | — |

**Expected cost: $0/month.** Only pays above ~10 GB/month downloads (roughly 50
concurrent viewers sustained).

## Connection hygiene (client-side, any plan)

1. `visibilitychange` → hidden: wait ~60s (quick tab switches shouldn't churn),
   then disconnect the WebSocket
2. Visible again: reconnect and re-sync
3. Optional periodic rotation so long-lived sockets don't accumulate overhead

**This does not raise the 100 cap** — Spark is hard-capped. It moves the ceiling
from "100 tabs ever open" to "100 tabs actively watched." Also reduces
bandwidth, which matters because the free download allowance is **360 MB/day**
and is only reachable via *push* (24 viewers polling every 10s = 622 MB/day
would exceed it).

## Rollback

| Failure | Response |
|---|---|
| Firebase outage | Viewers fall back to KV polling automatically |
| Bad migration | Flip `cloudProvider` back to `kv`. No redeploy |
| Credential leak | `wrangler secret put` a new one; never in the binary |

## Phases

| # | Work | Gate |
|---|---|---|
| 0 | Prereqs (manual): GCP project → Firebase → RTDB → upgrade to **Blaze** → budget alert at $25 → pick region | — |
| 1 | Test harness | Green on 1.1.15 |
| 2 | `functions/api/save.js`: secret check → Admin SDK write; `wrangler secret put` | Harness green, emulator tests pass |
| 3 | Vendor Firebase JS SDK into `public/vendor/` (pinned + checksummed); `af.js` subscribe; hygiene; **keep KV polling as fallback** | Live reads work; local/LAN byte-identical |
| 4 | Settings write secret (masked) → `data.json`; `cloudProvider` flag | Local path unaffected |
| 5 | Cutover: scratch instance → then flip default in a release | — |
| 6 | Cleanup (one release later): remove KV read path and `data.js` | Proven stable |

## Risks

1. **Second vendor = second outage mode.** Blast radius: optional feature only.
2. **Migration touches 4 files** — gated by Phase 1 and the provider flag.
3. **No hard spending cap on Blaze.** Firebase states plainly: *"budget alerts
   do not cap your usage or charges."* Mitigated by the $25 alert; push rate is
   bounded by the 10s tick + hash dedup.
4. **Blaze requires a card.**
5. **The real risk is that this is a large change to something that currently
   works.** The booth path is untouched by construction; Phase 1 exists so we
   are not trusting judgement here.

## Success criteria

- Online viewer shows the **full board, updating sub-second**, during a busy day
  with all 12 cars at both locations active
- **Zero** connection/download/Workers quota alerts over 30 days
- Booth behaviour byte-identical throughout
- Harness green on every commit
- A forgotten phone tab no longer consumes a connection

## Open decisions (answered)

1. Shared secret vs per-instance tokens → **shared secret**
2. Keep KV polling fallback → **yes, for one release**
3. Region → nearest to the two locations
4. Sequencing → harness → Task 2 licensing → this → macOS port