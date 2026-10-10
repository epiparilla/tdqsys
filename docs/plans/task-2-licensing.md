# Task 2 — Licensing & authorisation

**Status:** READY TO BUILD (decisions complete)
**Depends on:** `tests/` harness green as baseline
**Blocks:** nothing

## Goal

The client does not own the software. The installer runs only once authorised
with a licence you signed. They request a term, you generate a key, they enter
it once.

## Confirmed decisions

| Decision | Setting |
|---|---|
| Activation | Fully offline, signed licence code |
| Binding | Instance ID — one licence per installation |
| Term | Term only; no perpetual |
| Window | 12:00am start date → 11:59pm end date |
| Date source | Client picks; you assume the current year if omitted |
| Expiry | **Degraded** — queue runs, operator frozen |
| Pre-expiry warning | **None** — seasonal use, term sized to the event |
| Renewal | Replaces and extends; nothing else changes |
| First run | Activate → then configure |
| Video ads at expiry | Keep playing |

## Critical: seasonal 5–6 day terms

A 6-day licence is trivially defeated by setting the system clock back. The
**max-seen-timestamp guard is a core requirement, not defensive polish**:

- Record highest timestamp seen in **two separate files**
- Refuse to operate if the clock is >2 hours behind it
- Update on every successful start

Does not stop someone editing both files. Stops the naive attack, which with a
5-day window is the attack that will actually be attempted.

## Date semantics — store dates, not instants

Store `notBefore`/`notAfter` as plain `YYYY-MM-DD` and evaluate against the
**client's local clock**. Baking exact timestamps using our timezone shifts the
window by hours for clients elsewhere. Timezone fiddling can shift a boundary a
few hours — acceptable.

## Enforcement — `video_server.js`

Holds whether launched by Electron or run directly.

| Endpoint | Expired |
|---|---|
| `/api/save` | **403** `{error:"license_expired", notAfter}` |
| `/api/import` | **403** |
| `/api/clearVideos` | **403** |
| `/api/data`, `/api/config`, `/videos/*`, static | **open** |

Saved config and imported videos are **kept**. No import, no clear.

## Startup states — `main.js`, before `startEngine()` (line ~597)

| State | Behaviour |
|---|---|
| No licence | Activation window; engine and TTS never start |
| Valid | Normal |
| Expired | Full start; operator controls greyed out |

## Expired Settings UI

Settings stays **reachable**. Everything greyed out **except**:

- `upd-check-btn` (software update) — currently inside the locked form
- The licence-key input

Note: the existing lock is `pointer-events:none` on the whole `<form>`, which
would also lock the update button. Expiry needs a different mechanism —
explicitly `disabled` on each control except the two exempt ones. Better than
`pointer-events` for accessibility (screen readers announce it).

## Required fix: `afSaveState()`

`public/af.js` `afSaveState()` never checks `response.ok` and always returns
`true`. A 403 would be silently swallowed and data lost mid-event. Must check
status and surface expiry to the UI.

## Formats

**Licence** (signed, tamper-proof):
```json
{ "v":1, "i":"<instanceId>", "c":"Customer",
  "b":"2026-11-01", "x":"2026-11-06", "n":"<nonce>", "k":keyId }
```
Ed25519 → deflate → base64url, grouped. ~220 chars, or a `.tdqsyslic` file.
Checksum distinguishes *mistyped* from *invalid*. `k` (keyId) enables dual
public-key verification for future rotation.

**Request** (unsigned by design — we are the gatekeeper): instanceId + customer
+ chosen dates. The CLI **prints what it is about to issue and asks for
confirmation** so an edited request cannot slip past unnoticed.

## Your tooling

```
# ONE TIME - offline, on a machine not connected to the cloud
node tools/license.mjs keygen

# PER CUSTOMER
node tools/license.mjs issue --instance <uuid> --customer "Acme" \
        --from 11-01 --until 11-06
```

Rules the tooling must enforce:

1. **Term = event length + 2 days.** With no pre-expiry warning, an overrunning
   event freezes the dashboard mid-service. This margin is the only protection.
2. **Refuse to shorten an active term** — if a replacement licence ends earlier
   than the current one, warn and refuse.

## 🔑 The one unrecoverable mistake

**Losing `private.pem` means no existing customer can ever be licensed again.**
Every app already shipped carries the public half; without the private half we
cannot forge a signature, and re-activating every client becomes manual.

- Generate offline
- Back up in **two physical locations**
- Print it (~119 chars)
- Never commit it — gitignore + exclude `tools/` from the installer

Dual-key verification (Phase 2) exists precisely so this becomes a recovery
project rather than a rewrite.

## Phases

| # | Work | Gate |
|---|---|---|
| 1 | Test harness | Green on 1.1.15 |
| 2 | `app/license.js` — verify, expiry, clock guard, dual keys | Unit tests |
| 3 | Engine gate — 403 on the 3 write endpoints | Integration tests |
| 4 | `afSaveState()` status handling + greyed-out Settings | Expiry visibly freezes, Update still works |
| 5 | `main.js` 3-state gate before `startEngine()` | No licence → activation only |
| 6 | Licence card: status, dates, generate request, paste key | Reachable when expired |
| 7 | Wizard — activation ahead of configuration | Fresh-install test |
| 8 | `tools/license.mjs` + `LICENSING.md` + gitignore | Issue a licence end-to-end |

## Tests

Valid accepted · wrong Instance ID refused · expired → reads fine, writes 403 ·
tampered signature refused · **clock rollback refused** · future-dated not yet
active · another customer's licence refused · expired save surfaces the 403 ·
**Update button still clickable while expired**

## Honest limitation

Any licensing running on the client's machine is bypassable by a determined
person (patch `app.asar`, hook `crypto.verify`). It stops casual unlicensed use
and redistribution and provides a legitimate licensing basis. It does not stop
someone specifically trying to defeat it. Real protection needs online
enforcement, which conflicts with offline-first design.