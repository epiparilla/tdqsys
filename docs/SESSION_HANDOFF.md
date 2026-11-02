# TDQSYS session handoff

Saved 2 November 2026, Asia/Manila. This is a conversation handoff summary,
not a verbatim transcript. The user is shutting down and will resume later.

## Resume here

Update, 3 November 2026: local-first queue operations are implemented. Read the
new Local queue operations section in FUTURE_IMPROVEMENTS.md and manual steps
21-23 in TEST_DRIVE_TEST_BUILD.md before the earlier speech-only notes below.
Next acceptance is offline/local Ongoing and Call Back, restart recovery and
online catch-up using the newest manual installer. Source modules:
`shared/test-drive-local.js`, native main-process action/sync helpers, and
`202611030001_local_operation_sync.sql`. The durable per-instance snapshot and
outbox live beside data.json. Printing/allocation/reset still require the cloud
and drain pending statuses first. Conflicts stay retained for review/export;
older-run actions require explicit archival. No version/manifest bump is allowed.
The prior implementation commit and installer byte count recorded below are
historical; use the current Git HEAD and artifact rather than those older values.
Verification: 302 Node tests passed (three optional skips), 21 database checks,
nine speech checks, and live disposable-location restart/lost-ack replay passed.
The rebuilt manual installer is 232673492 bytes. Packaged main/preload, local
journal module and changed UI files match source. Main and preview Pages were
deployed; public registration/display routes work and desktop routes stay blocked.

The latest completed task made Settings announcement and Call Back previews
use the same cached segments and stitching as live Ongoing/Call Back. Added
joins were reduced from 50 ms to 10 ms, with synthesis speed still 1.0.
Matching Settings/model/ticket inputs produced byte-identical preview/live WAVs
in the packaged engine. Unsaved preview edits do not change saved Settings or
enqueue speaker playback. Background preparation yields to preview requests.

Next: user installs the latest manual installer and listens to Test announcement,
Call Back and live announcements. Judge clarity/cadence and remaining perceived
latency. Preview uses ticket 01 and the first configured vehicle; compare the same
voice, wording, model and ticket when testing exact equality. General Test voice
is a separate voice audition. Do not claim physical speaker acceptance is done.

The bundled kokoro-onnx is 0.5.0. Its create API has no instruction-prompt or shared
context input between independent clips. Whole-sentence synthesis has different
prosody; punctuation/phonemes cannot guarantee identical independent-clip delivery.
Do not upgrade the engine or switch to per-ticket whole-sentence synthesis without
considering the user's pre-render/cache requirement.

## Current artifacts and protection

- Canonical repo: `C:\Users\Epi\Documents\Projects\AutoFocus\tdqsys`.
- Latest implementation commit, pushed to origin/main: `5aae8ec`.
- Manual installer: `app/dist-test-drive/tdqsys-test-drive-1.1.28.exe`,
  232667650 bytes. Build completed; packaged source/resources checked.
- Version remains **1.1.28**. Never change `public/version.json`, raise the version,
  replace stable release assets, or trigger update notifications before acceptance.
- Stable checkpoint: `90d0ee7`, tag `checkpoint-v1.1.28-pre-test-drive`, branch
  `backup/v1.1.28-pre-test-drive`.
- Stable installer: `app/dist-installer/tdqsys-setup-1.1.28.exe`; SHA256
  `06E2E4D22F52D81F1181E480DC497BC914A99F2C08CA7A849ED17102F5A2A14C`.
- Preview and main Pages deployments completed. Staff controls/Settings stay
  desktop-only; public pages are registration forms and queue displays.
- Latest checks: 288 Node tests passed, 3 optional skips; 9 Python speech tests
  passed. Prior unchanged database integration suite passed 19 checks. Packaged
  speech probe passed private-route authorization, preview/live byte equality,
  cache reuse, unsaved Settings preservation and FIFO behavior, with physical
  playback suppressed (2.24 ms median cached assembly, not speaker latency).

## Recent completed changes

- Master Table shows agent name/four-digit code, compact controls and sorting by
  client name, agent, model or status. Model selection survives background refresh.
- Master Table reprint/issue validates the selected printer, reuses unpassed tickets
  or creates the next allocated number, then prints its exact job directly.
  Regression: 01 passed, 02 displayed, 03/04 issued -> new 05. Failed printing retains
  the exact ticket/job for recovery. Obsolete pending source print jobs are cancelled.
- Print Queue has client/SE name search, compact sizing and Cancel for pending/failed
  print requests. Cancellation preserves clients/tickets. Claimed jobs need physical
  output recovery. Sales Executives supports sorting and SE-code reprint queuing.
- Queue Board is a seamless infinite horizontal track: three interactive copies
  when overflowing, no Previous/Next buttons or visible scrollbar. Wheel/trackpad,
  touch, drag and focused-board arrow keys work. Refresh/resize retain position.
  Unchanged snapshots reuse columns; input updates are batched per animation frame.
- Red-accent regression fixed: ResizeObserver ran before the first snapshot and
  replaced local bootstrap colors with the fallback. Initial renders now preserve
  locally injected saved branding. QR images regenerate only when needed on Setup.
- Desktop Settings has one-dealership-per-line configuration. Location-specific
  SE registration uses a required dropdown; API/DB enforce membership. Empty lists
  pause new SE registration. Old records/codes remain valid after options change.
  Older desktops omitting the setting preserve the saved cloud list.
- Vehicle rows have printable shortname then shortname pronunciation, with its
  own preview. Saved/restored `shortnamePronounce` controls spoken model names in
  Call Back and `{counter}`; prefix pronunciation and printed text remain distinct.
- Mirror link, Copy action, mirror QR and PNG/SVG downloads moved from Settings
  to Event Setup / QR Codes. Settings retains immutable Instance ID/Copy.
- Native client labels are 50 x 30mm, auto-fit model shortname and 36pt complete
  prefixed queue number (AA01/AA100). SE label printing was accepted by the user.
- Speech is desktop-owned FIFO, continues across facilitator-page navigation,
  and uses persistent voice/text/speed-specific WAV segments. Cache checks run
  in the background; an already-running warmup pass can delay the next rescan.

## Required operating decisions retained

One ongoing client per vehicle model. Ongoing updates that model's TV number and
completes its previous ongoing entry. No Show is a marker; returning clients receive
new numbers. Passed means lower than that model's displayed number. Same-day Reset
to Zero opens a new run and resets all TV/model numbers, preserving client/history.
Master Table defaults to current run, with earlier same-day lookup. SE reset
deactivates today's codes, keeps history/clients and allows fresh registrations.
Daily SE codes expire at midnight and never duplicate within that day's location.

Each location has its own identity, forms/QRs, queue runs, dealers and Google Sheet
URL. Shared Google service account; tabs auto-created as `TDQSYS Reg mm/dd/yyyy`.
Raw registration is one row per client submission; later vehicle changes do not
rewrite it. Sheets jobs silently retry while the desktop app runs. Do not expose
keys, writer tokens, encrypted code secrets or client contact details in output.

## Files and workflow

Read `docs/FUTURE_IMPROVEMENTS.md`, its byte-identical `.txt` mirror, and
`docs/TEST_DRIVE_TEST_BUILD.md`. User explicitly wants all three local files kept
updated with pushed changes; verify their hashes against committed versions.

Speech: `speech_segments.py`, `speech_service.py`, `tts_server.py`, `app/main.js`,
`public/settings-speech.js`. Preview uses native `speech-preview` IPC and private
loopback `/api/preview-ticket`; its token stays in the native process.

Commands (PowerShell):

```powershell
node tests\run.js
python -m unittest discover -s tests -p speech_segments_test.py
node tests\test-drive-db.integration.js
python -m PyInstaller --noconfirm tts_server.spec
npm.cmd run --prefix app assemble:server
node tools/verify-ticket-speech.cjs app/server/tts_server.exe
npm.cmd run --prefix app build:installer -- --config.directories.output=dist-test-drive --config.nsis.artifactName=tdqsys-test-drive-1.1.28.exe
```

Finish the disposable speech verifier and its process cleanup before building
the installer to avoid locked executable files. Tests use isolated data; never
reset the user's live location for an automated test. Headless UI checks fail on
this machine; distinguish code/DOM tests from visual and audible acceptance.

Clear this repo's `.wrangler` before EACH Pages deployment, then use
`npx.cmd --offline wrangler pages deploy public --project-name tdqsys --branch
test-drive-preview` (or `main`) `--commit-dirty=true --skip-caching`.
Commit/push and Pages deployment are separate. Read the supplied AGENTS.md notes.

Untracked `outputs/tdqsys-simulation-20261102/` contains the user's dummy-client
and dummy-SE spreadsheets plus assigned test codes/IDs. Keep local; do not push.
Earlier API simulation completed 10 SEs, 20 clients and 27 tickets, with 20 unique
Sheets rows verified. Preserve those records for the user's tests. Disposable
cloud probe records/tabs have been cleaned up. No simulation is awaiting resume.

The user wants autonomous completion without repeated requests to continue.
Deployment target remains three locations on 12 November 2026. Resume testing,
not a production version bump. No subagents unless explicitly authorized.
