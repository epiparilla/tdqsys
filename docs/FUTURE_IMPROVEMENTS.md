# TDQSYS Future Improvements


## 8 November speech process shutdown fix

Root cause: cleanup killed the PyInstaller speech launcher before requesting
Windows taskkill /T, so the detached worker could survive and lock its EXE.
Quit and Restart now stop each owned process tree synchronously by PID before
its root disappears; no executable-name or port-owner sweeps are used.
Queued engine/TTS restart callbacks also refuse to spawn while quitting.
Window close still keeps the app in its tray by design; use Quit TDQSYS for
full shutdown. The fix does not alter voices, cache policy, queue data or v1.

347 Node checks pass / 3 skipped, including four shutdown regression tests.
Two isolated real Windows launcher/worker trees were terminated successfully.
This verifies process-tree termination, not a full installed-app exit cycle;
manual acceptance: quit from tray, check no v2 speech worker remains, then
install this build. No live app was started or stopped for these checks.
No v2 speech worker was present during the diagnostic process inventory.

Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-shutdownfix-20261108/tdqsys-v2-setup-2.0.0.exe
Earlier installers are preserved; no OTA activation or web deployment needed
for this desktop-only fix. If an earlier build leaves its worker behind,
end only that TDQSYS v2 speech process before this first corrective install.



## 8 November frozen-header underlayer fix

Fixed scrolled content peeking around the frozen desktop header. The sticky
header now has an opaque, isolated backing extending over the top and side
page padding, including fractional-pixel edges at Windows display scaling.
Header controls remain clickable; the accent divider stays visible. Applies
to the common desktop shell and Settings, without restyling forms or TV.
343 Node checks pass / 3 skipped. Manual installer remains v2.0.0:
app/dist-test-drive-v2-headerfix-20261108/tdqsys-v2-setup-2.0.0.exe
Earlier installers and live data are preserved; v1 and OTA settings unchanged.



## 8 November compact desktop layout and frozen controls

V2 staff pages now use smaller titles, navigation, buttons and tighter spacing.
Master Table, Print Queue, Agents and Giveaways keep the entire top shell and
search/sort/printer controls visible while rows scroll inside their own pane;
column headings remain frozen, including during horizontal table scrolling.
Event Setup, Settings and Live Dashboard retain a pinned compact header during
vertical scrolling. Settings and analytics tables have bounded scrolling panes
with frozen column headings. Vehicle columns retain the continuous horizontal
loop and now scroll long queues vertically beneath their model heading.
Public registration forms and TV/remote displays are not restyled. No live
registrations, queue numbers, settings, giveaway stock or printed jobs changed.

Verified with an isolated read-only Electron fixture across 24 page/window
combinations (1600x1000, 1200x800 and 800x600 requested windows; Windows scaling
can constrain the first viewport). Scroll checks confirm no document overflow
on table pages and headings stay aligned with their panes after scrolling.
Screenshots inspected; existing client presentation files were not overwritten.
342 Node tests pass / 3 skipped; 37 PostgreSQL checks and 16 speech tests pass.
V2 Pages assets deployed. V1 remains unchanged and v2 OTA remains disabled.
Latest manual installer, still 2.0.0:
app/dist-test-drive-v2-compact-20261108/tdqsys-v2-setup-2.0.0.exe
Install this build manually to see the layout changes in the desktop app;
a website deployment cannot update pages served by an older installed build.
The earlier Agents and bootstrap installers are preserved.


## 8 November Agent terminology

V2 now uses Agent and Agents throughout visible forms, navigation, page titles,
settings, QR captions, tables, reset/help text, print-job descriptions and
validation/error messages. Registered Agents replaces the Sales Executive list.
Printed code labels already contain only a name and four-digit code; their
layout and payload stay unchanged.

Legacy URLs, action names, seCode payload fields and database identifiers remain
compatible. Migration 202611080001 updates human-readable RPC messages only;
permissions remain private (zero browser-executable functions verified live).
New empty Google Sheets tabs use Agent name; existing headers and raw records
are not rewritten. No registration, queue, code or giveaway data was changed.

V2 site and private endpoint deployed. Live form/invalid-input checks passed
without creating registrations. V1 feed remains 1.1.28 and v2 OTA remains disabled.
340 Node checks passing / 3 skipped; 37 database checks; 16 speech tests.
Seven packaged UI files verified byte-identical to tested source.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-agents-20261108/tdqsys-v2-setup-2.0.0.exe
(232,693,305 bytes), also copied into the TDQSYS v2 working folder.
The earlier bootstrap installer is preserved. No automatic installation.
The 8 November presentation was generated before this terminology change and
has not been regenerated as part of this app-wide wording task.

## 7 November: v1/v2 separation implemented

V1 remains 1.1.28 with its existing identity, data folder and live update feed.
V2 now has its own 2.0.0 manual bootstrap, com.tdqsys.queue.v2 installer identity,
TDQSYS v2 data/profile folder, distinct executable/speech names, ports 8082/8002
and fixed tdqsys-v2.pages.dev update feed. The separate v2 Pages site is deployed;
its manifest is explicitly DISABLED, so no OTA update is being offered.

All 38 private TDQSYS RPC overloads now deny direct browser execution. The
permission-only migration preserves records and queue_state viewing. Tests
reproduce hosted default grants from the first migration onward.

Source working folders: ../TDQSYS v1 (legacy-v1 checkpoint) and ../TDQSYS v2
(release/v2). Canonical tdqsys is retained; installed folders and existing test
data were not renamed/copied. V2 creates a new instance needing licence and
configuration. Do not blindly clone old data.json/writer credentials.
Printing-only v1 enhancement remains future work, not part of this separation.

Manual installer: app/dist-test-drive-v2-bootstrap/tdqsys-v2-setup-2.0.0.exe
(232,693,303 bytes). Portable: tdqsys-v2-portable-2.0.0.exe (232,412,585 bytes).
Verified installer copies also reside in the same relative TDQSYS v2 worktree path.
Preserved v1 worktree suite: 206 passing / 12 optional/build-artifact skips.
338 Node passing / 3 skipped; 36 database checks; 16 speech tests.
Both sites' public configuration endpoints and invalid-input rejection verified;
packaged native/engine/restore/product files match source. No new registrations,
live reset, cleanup, installer execution or actual OTA application performed.

See V1_V2_SEPARATION.md for boundaries, safe deployment and manual OTA acceptance.
This supersedes earlier advice that both apps must remain version 1.1.28: only
v1 stays frozen. V2's new major version is a separate manually installed product.

## 6 November: required registration contact numbers

SE registration now asks for Contact No. Both SE and client forms require exactly
11 ASCII digits, numbers only (example: 09171234567). Numeric mobile keyboard,
required/pattern/min/max constraints and shared server validation enforce the
same rule; spaces, +63, punctuation, letters and shorter/longer values fail.
Numbers are stored as text to preserve leading zeroes. No uniqueness restriction
was added. Existing records are unchanged; legacy SE contacts remain blank.

Migration 202611060006_registration_contacts adds the SE contact field, a private
contact-aware SE check-in RPC and insert-only client database validation.
Existing SE registration/code-printing behavior is preserved. Test missing,
10/12-digit, letters, spaces, +63 and valid 11-digit values in both forms.
Automated checks: 333 Node passing / 3 skipped and 35 PostgreSQL checks.
New manual installer path:
`app/dist-test-drive-20261106-contact-validation/tdqsys-test-drive-1.1.28.exe`.
Version/updater remain unchanged. No live test registrations were created.

Contact forms/API deployed and verified online. Installer build completed:
232,692,773 bytes; three packaged registration assets match source exactly.

## 6 November: run-scoped giveaway resets and safe history cleanup

This section supersedes earlier carry-forward and permanent-per-registration claim
descriptions below. Normal **Reset to Zero / Open run** and daily rollover start
giveaway opening stock, replenishments, issued totals and remaining stock at zero.
Same-day registrations become Unclaimed again in the new run; one of each item
may be given per registration PER RUN. Old claims/stock remain in historical
views. Enter the new opening balances for each new run; saved old quantities
are not automatically reapplied. Daily views exclude previous-day submissions.

Existing legacy runs are preserved during the migration, including their stock.
The next manual reset or daily rollover activates the new zero-start policy.
No live reset or deletion was performed during implementation.

Desktop **Event Setup / QR Codes** now includes advanced history cleanup:
- Delete selected CLOSED test runs; the active run cannot be selected.
- Clean slate deletes this location's visible operating history and opens Run 1.
- Preview counts, save/verify a private backup, then type DELETE SELECTED RUNS
  or CLEAN SLATE before deletion is enabled. Changed data requires a fresh backup.
- Keep Google Sheets completely unchanged, as explicitly requested. Saved
  settings, vehicles, branding, connections, licensing and audio cache remain.
- Selected-run deletion preserves registrations referenced by retained runs.
  Legacy stock-sharing histories must be deleted together or via Clean slate.
- Retired SE-code hashes and cleanup retry receipts remain private safeguards;
  previously printed codes cannot become valid for another SE after cleanup.
- Lost responses retry the same cleanup ID without deleting newly created data.
  If outcome is unconfirmed, queue writes are protected until reconciliation.

Backups contain personal data and SE records: keep them private. There is no
one-click restore; recovery requires developer-assisted, location-scoped restore.
See HISTORY_CLEANUP_RECOVERY.md. Nothing is deleted merely by opening preview.

Backend migrations 202611060004 and 202611060005 plus the private operation
endpoint are deployed. Read-only live verification confirmed 7 runs,
73 registrations, 103 tickets, 73 Sheets jobs and 6 stock events unchanged.
Checks: 330 Node passing / 3 skipped, 34 PostgreSQL checks, 16 speech tests.
Latest manual installer:
`app/dist-test-drive-20261106-reset-cleanup/tdqsys-test-drive-1.1.28.exe`
(232,692,573 bytes). Packaged main and nine changed resources match source.
Version/updater remain 1.1.28; no automatic installation or Pages deployment.
Manual/visual acceptance remains pending.

6 November multi-item approval: implemented Manage items checkbox dialog,
explicit Give selected items, locked issued items, disabled unavailable items,
and row chips/Unclaimed. No quantity fields. Database unique registration/item
claims (also case-insensitive), atomic whole-batch stock checks/deductions and
idempotent request receipts prevent duplicates, partial batches and retry double
deductions. Uncertain request IDs persist across restart; explicit rejection
allows reselection. Drafts survive polling and retired claims remain visible.
Current legacy selections migrate without another stock deduction. The prior
clear/replace UI is superseded: issued items are now locked. Original Sheet
payloads, inventory history, timestamp formatting and clipping remain intact.
Backend/migration deployed, all private browser permissions verified. Live stock
preserved; no test gifts issued. 324 Node passing / 3 skipped, 28 database checks,
16 Python speech tests. Built manual installer:
`app/dist-test-drive-20261106-multi-giveaways/tdqsys-test-drive-1.1.28.exe`.
Version/updater unchanged; visual/manual acceptance pending.

6 November Giveaways layout: timestamps use dd/mm/yyyy hh:mm:ss in location
timezone (24-hour), email column narrowed, email and vehicle values clipped
with ellipsis and full hover text. Raw data stays unchanged. 321 Node passing /
3 skipped. Built manual installer (packaged JS/CSS verified against source):
`app/dist-test-drive-20261106-giveaway-layout/tdqsys-test-drive-1.1.28.exe`.
Multi-item UI proposal ONLY: Manage items opens distinct-item checkboxes;
already-issued items checked/locked, unavailable items disabled; explicit Give
selected items, then item chips. Requires backend unique registration/item
records and atomic batch stock deduction before implementation. No multi-item
change is enabled yet; existing inventory rules/version/updater are preserved.

6 November stock/dashboard extension: replaced giveaway textarea with three
Settings columns: Item, Beginning balance / replenish, Total beginning balance.
Openings save once through configuration sync; + opens inline replenishment
controls. Third column is total supplied, not remaining. Append-only stock
history, idempotent retry IDs, retained retired-item history and cross-day/run
stock carry are implemented. Giveaway choices atomically deduct/restore stock
and reject exhaustion. Existing selections are preserved without guessed stock.

New desktop Live Dashboard has current/all-historical run selection, summary
cards, per-model client/ticket/status tables and charts, giveaway item totals,
stock-at-start/additions/given/restored/remaining tables and charts. Unique new
registrations are attributed to their first ticket run; queued clients and
ticket counts remain separate. Closed-run stock excludes future receipts;
actual run boundary timestamps and shared reset locks prevent overlap errors.
Old movement history is limited to recoverable saved selections. Backend and
additive migration deployed; browser roles denied private inventory access.
No live records/claims/receipts changed. 320 Node passing / 3 skipped, 26 database
checks, 16 Python speech tests. Built manual installer (packaged UI/native bridge
verified against final source):
`app/dist-test-drive-20261106-stock-dashboard/tdqsys-test-drive-1.1.28.exe`.
Version/updater unchanged; visual/manual acceptance pending.

6 November Giveaways: implemented a desktop-only page with today's original raw
registration data, matching Google Sheets minus the visible Registration ID,
and an item dropdown defaulting to Unclaimed. One row per registration, not per
vehicle/ticket, including earlier runs today. Settings supplies a deduplicated
one-item-per-line list like dealerships. Selections save automatically, persist
across navigation/restarts/queue resets, and remain recorded if the item is later
removed from setup. Raw Sheet data is never edited by giveaway dispensing.
Connected writes validate location ownership, configured items, licence and
prior selection; conflicting or uncertain writes require refresh before handing
over an item. No offline giveaway outbox is claimed. Search and compact table
styling included. Additive migration/private service deployed; live records and
claims untouched (12 rows today, all Unclaimed). 316 Node passing / 3 skipped,
22 PostgreSQL checks and 16 Python speech tests. Built manual installer:
`app/dist-test-drive-20261106-giveaways/tdqsys-test-drive-1.1.28.exe`.
Version/updater unchanged; visual/manual acceptance remains pending.

6 November whole-sentence implementation: user approved replacing segmented
production speech. Kokoro renders one complete Announcement and Call Back clip
per ticket; no manual joins. Saved voice/wording/pronunciation hints remain.
Persistent `audio_cache/sentences-v1` is separate from old caches. Prepare 01–50
per model/action, extending by 50 at each batch midpoint (25, 75, etc.), fairly
across models and yielding between clips to live jobs/previews. Cached disk/RAM
playback bypasses warmup rendering; cold clips still need generation. Voice or
wording changes use new keys and obsolete sweeps stop between renders. Progress
appears in Settings and facilitator pages. No live data/reset/updater changes.
310 Node passing / 3 skipped; 16 Python speech tests passing. Packaged verifier
passed preview/live equality, cache reuse and FIFO with playback suppressed;
physical listening remains required. Built manual installer:
`app/dist-test-drive-20261106-sentences/tdqsys-test-drive-1.1.28.exe`; packaged
speech executable/UI verified against final staging. This supersedes earlier
segmented plans. Version 1.1.28 and the public updater remain unchanged.

6 November table consistency: Sales Executives shares the Master Table / Print
Queue compact formatting (12 px cells/headers, 7 px by 6 px cell padding;
11 px action buttons, 4 px padding, 2 px margins). No behavior/data changes.
Full Node suite: 309 passing, 3 skipped, 0 failures; visual acceptance pending.

6 November setup relocation: Google Sheets URL, service-account sharing/copy
and connection/tab-preparation controls moved from Settings to Event Setup /
QR Codes, with a dedicated Save Google Sheets URL button. Existing destinations
are retained; the local URL-only save does not replace queues or other settings.
Background sync/retry behavior is unchanged. Regression suite: 308 passing,
3 skipped, 0 failures. Manual/visual acceptance pending; desktop version remains
1.1.28, with no public release/update-manifest changes.

Last reconciled with source and the manual test build: **3 November 2026**.

Canonical planning document: `docs/FUTURE_IMPROVEMENTS.md`. `docs/FUTURE_IMPROVEMENTS.txt` is its synchronized text copy.

This document records approved requirements, their current implementation, and remaining acceptance work. The production desktop release and public update manifest remain **1.1.28**. Development installers are installed manually; release assets and update notifications must stay unchanged until acceptance. The deployment target is **12 November 2026 at three independent locations**.

## Current implementation and verification

6 November phoneme trial: a user-requested isolated Kokoro audition at `outputs/tdqsys-phoneme-audition-20261106/index.html` compares six segmented Announcement/Call Back pairs with explicit phoneme overrides for only queue prefix and vehicle name. It preserves phrase/number recordings, saved voice, speed and 10 ms joins. Kokoro already phonemizes ordinary text internally; the trial uses different proposed IPA explicitly, not merely the same automatic output. Listening approval is pending. No production fields, cache format, source or installer were changed.

EX listening follow-up: user heard "LI EKS". Focused comparison at `outputs/tdqsys-phoneme-audition-20261106/ex-prefix/index.html` tests original, unstressed, no vowel-length marks and independently rendered E/X letters, alone and in context (12 WAVs). Only the prefix varies; original contexts are byte-identical. Listening selection remains pending; production is unchanged.

5 November presentation evidence: a newly requested simulation completed 10 SEs, 20 clients and 27 tickets. All 20 raw client rows were verified exactly once in the daily Sheet. The client package under `outputs/TDQSYS Client Presentation 2026-11-05/` contains 20 captures and a brief illustrated Word walkthrough. User-approved, separate read-only Electron capture replaced failing Windows capture; production code/settings/audio were unchanged. Keep the package and simulation private/untracked. These demonstration artifacts do not replace final printer, fluency or three-location acceptance.

### Latest listening feedback and pending design (3 November)

5 November segmented follow-up: `outputs/tdqsys-voice-audition-20261105/segmented.html` now provides eight same-voice comparisons of whole-sentence versus independently generated Pocket segments. It reuses TDQSYS's unchanged planner/stitcher, 10 ms joins and matching silence trim. Separate cache only; no application changes. Audio format/cache reuse checks and nine Python speech tests passed. Fluency remains for the user's listening assessment.

5 November update: the user approved an **isolated Pocket TTS audition**, not an engine replacement. The separate loopback tester is on port 8012, with a comparison page and 14 verified WAV files in `outputs/tdqsys-voice-audition-20261105/`. Six full sentences compare Pocket Marius (1.07-1.37 s per clip) with Kokoro am_liam (5.79-7.12 s); two additional Pocket Alba clips are included. Timings include complete HTTP generation, not just the first streamed chunk; different voices and uncontrolled background load prevent treating this as a quality or universal speed verdict. No TDQSYS production source/settings/cache/installer changed. Launch/stop controls passed; fluency and background-load acceptance remain pending. See `SESSION_HANDOFF.md` and the local audition README for pinned assets, the preset-shortcut workaround and voice credits.

The user confirmed that live announcements are now instant after the local-first change. The remaining speech priority is fluent whole-sentence intonation without audible segment boundaries. Full-sentence caching was discussed but is **not implemented or approved for implementation yet**; the current installer still stitches cached segments.

A six-sample full-sentence synthesis benchmark using the laptop's saved `am_liam` voice averaged 7.088 seconds per clip (6.576-7.631 seconds). It did not play audio or change Settings. Proposed recordings would be two per ticket/model (Ongoing and Call Back). About 16 clips fit in two minutes; preparing 50 numbers for seven models would take approximately 83 minutes, or 142 minutes for 12 models. These are extrapolations, not measured bulk-generation guarantees. A small initial buffer and prioritized rolling preparation appear more practical for 20-30 minute drives. Keep old voice/text caches reusable. Before implementation, settle readiness/cold-clip handling and verify background CPU load and cached-playback independence; do not regress instant announcements.

The requested 3 November simulation completed 10 SE registrations, 20 client registrations and 27 tickets. All 20 client rows were verified exactly once in `TDQSYS Reg 11/03/2026`. Preserve the records for testing and do not restart the simulation automatically. Local private output and the full continuation notes are referenced in `SESSION_HANDOFF.md`.

The current manual installer is `app/dist-test-drive/tdqsys-test-drive-1.1.28.exe`. The restorable production checkpoint is commit `90d0ee7`, tag `checkpoint-v1.1.28-pre-test-drive`, with branch `backup/v1.1.28-pre-test-drive`; the released installer remains in `app/dist-installer/`.

| Area | Current manual-build status |
| --- | --- |
| Restore | Preserves the destination Instance ID, writer credential and licence binding, shows source/destination identities, and retains a queue-state safety copy. |
| Speech | Packaged Kokoro voices, templates and previews are implemented. Ongoing/Call Back use a private desktop-owned FIFO player with persistent voice/text-specific clips, prefixed tickets and background preparation; playback continues across facilitator pages. |
| Registration | Separate location-scoped client and SE forms; required four-step client form, consent snapshots, SE-code validation/prefill, multi-model tickets, duplicate checks and submission idempotency are implemented. |
| Facilitator pages | The former plus/minus dashboard is replaced by the test-drive board. Separate Master Table, Print Queue, Sales Executives and Event Setup pages are implemented. Brand 2 has its own enabled-only board. |
| Dashboard layout | Black background, centered heading/buttons, configured brand Controls heading/accent, at most three visible wide model columns, horizontal scrolling and one-line client/action rows are implemented. |
| First-render appearance | The local engine embeds saved brand names/colors before the page renders. Inter is bundled/preloaded locally, and status text has reserved space. Branding and initial styling do not wait for the cloud snapshot or Google Fonts. |
| Queue/display | One ongoing client per model; selecting Ongoing completes only that model's previous client and updates its local/TV number through the existing queue mirror. |
| Printing | Windows printer selection, 50 x 30 mm labels, separate per-model jobs, exclusive claims, recovery and reissue are implemented. SE names and client model shortnames auto-fit; both code/number sizes start at 36pt. Client labels include the complete prefix and at least two digits (AA01, AA100). Active SE codes can be requeued from Sales Executives. |
| Driver integration | The installer bundles `NiimbotPrinterDriverInstaller-3.0.2.1.exe`. Registered NIIMBOT drivers/vendor driver packages are detected and skipped; otherwise the signed vendor setup opens for installation/model selection. |
| Reset controls | Event Setup starts a new queue run and resets all model/TV numbers. Settings clears display counters only. The separate SE reset deactivates today's codes and permits fresh check-ins. All preserve client records. |
| Google Sheets | Saved location Settings sync automatically; the desktop-owned worker retries raw-registration jobs every 15 seconds while TDQSYS runs, independently of the open page. Daily tabs, headers and duplicate-delivery checks are implemented. |

Recorded verification: **305 Node tests passed, three optional skips, 21 PostgreSQL integration checks and nine Python speech checks passed**. Checks cover direct printing/reissue, dealership lists/dropdown and server enforcement, retained shortname pronunciation, startup resize branding, coalesced scroll frames, unchanged-snapshot DOM reuse, sorting/search and infinite scrolling. Live disposable-location checks cover configured dealership choices, rejection of unlisted dealerships, registration, reprints and reset/history. The latest packaged speech probe reused prepared clips at a 2.24 ms median cached HTTP assembly time and completed two FIFO jobs with physical playback suppressed. This is assembly timing, not speaker latency. These results do not replace physical/manual acceptance.

### Local queue operations (3 November 2026)

- Day-rollover fix: the desktop now resets the separately persisted TV/model numbers to zero at the location's midnight, including offline operation and restart recovery. Loading a new run also reconciles its model display numbers. History and unsynced actions are retained; a fresh current-day run is still required before calling clients. Added midnight, restart, same-day-reset and native-worker regression coverage.
- The desktop keeps a durable working snapshot and ordered operation journal in `test-drive-<instanceId>.json` under its data directory. Ongoing, Done, No Show and Cancelled status changes are saved locally; Call Back reads local ticket/model data. Ongoing projects the chosen model's number to the local TV state and queues desktop-owned speech without awaiting cloud requests. One ongoing client per model remains enforced locally.
- A desktop-owned worker refreshes registrations in the background and replays pending changes using unique operation IDs. Cloud receipt transactions validate location/run ownership and apply each operation once. Lost acknowledgements can be retried after restart without repeating the transition or undoing later actions. Stale snapshots retain pending local overlays while new registrations are merged.
- Cloud allocation remains authoritative for web registrations and desktop reissues. Printing, reissue, configuration and reset actions drain pending status changes first so server-side passed-number checks remain consistent. These actions still need connectivity; cached local queue operations can continue through a connection outage.
- A changed or expired run prevents stale local calls. Rejected sync operations stay in the journal and are flagged for review. Event Setup can export recovery data, retry current-run blocked actions after recovery, or explicitly archive earlier-run pending actions without deleting registrations. Backups include the local journal as a recovery sidecar; restore retains that sidecar separately and never automatically replays a foreign or older journal.
- The online viewer and cloud duplicate-ticket checks reflect the last successfully synchronized state during an outage. After reconnection, statuses and display numbers catch up. Initial use needs a successful snapshot; later same-day restarts can use the saved local queue. Physical speaker startup, unprepared clips and FIFO wait behind an existing announcement remain separate from cloud latency.
- Acceptance evidence: local commit/display/speech-enqueue completed in approximately 80 ms in the controlled native-helper test, with zero cloud calls on that path. A deliberately blocked background request did not block Call Back. This is a software-path measurement, not a physical speaker-start benchmark.
- Live disposable-location verification also passed restart recovery after a simulated lost acknowledgement, ordered replay, and an old duplicate operation arriving after a newer Ongoing action. Temporary verification records were removed; existing location registrations were preserved.

### Earlier facilitator refinements (2 November 2026)

- Settings **Test announcement** and **Test call-back announcement** now use the same ticket planner, persistent clips and PCM stitching as live Ongoing/Call Back. For matching saved values and ticket 01, preview/live WAV bytes match. Unsaved model/voice/wording changes can be auditioned without saving Settings or enqueuing live playback. The added gap between clips is reduced from 50 ms to 10 ms at the existing 1.0 speech speed; valid cached clips remain reusable. Background preparation yields to preview requests. The bundled Kokoro ONNX 0.5.0 has no instruction-prompt or shared sentence-context input for independent clips, so joined segments can still have different prosody from a single full-sentence synthesis.
- Mirror sharing moved from Settings to Event Setup / QR Codes: the location-specific read-only viewer link, Copy action, QR canvas and PNG/SVG downloads live together there. Local bootstrap supplies the link before cloud registration data loads. Settings retains the immutable Instance ID and its Copy action.
- Desktop Settings includes a dealership list, one name per line. It syncs per location and supplies the required dropdown on SE registration. Names are trimmed/deduplicated, with at most 200 options of 160 characters each. API/database checks reject values outside the saved list; an empty list pauses new SE registrations. Existing SEs, codes and client references remain intact when options change. Older desktops that omit this setting preserve the cloud list.
- Vehicle configuration includes **Shortname pronunciation** immediately after printable shortname, with its own preview control. It is saved/restored with each model and used for spoken model names in Call Back and `{counter}`. Printed labels, displayed model names and prefix pronunciation remain distinct; a blank field retains the existing full-model-name speech.
- Startup resize now uses local bootstrap branding before a cloud snapshot exists, fixing the red accent fallback introduced by the infinite track. Unchanged snapshots retain the existing column DOM; wheel/drag changes are batched into one animation frame. QR images are generated only on Event Setup when links change.
- Queue Board uses a seamless infinite horizontal track with no Previous/Next buttons or visible scrollbar. When models overflow, matching interactive cycles on both sides let the last model continue directly into the first. Whole-cycle recentering preserves the same visible content and fractional position instead of jumping between ends. Mouse wheel/trackpad, touch scrolling, mouse drag and focused-board arrow keys are supported. Refresh/resize preserve the position, and refresh does not replace columns during mouse dragging. At most three wide columns remain visible; models that already fit are not repeated.
- Settings text previews use the first configured vehicle's prefix and `01` (for example `CRY01`). Spoken previews use that vehicle's saved pronunciation and digits, matching live `{ticket}` substitution. `{counter}` and `{service}` use its model and brand names.
- Master Table sorts by name, agent, model or status in either direction. Model choices survive background refresh, and a focused model selector is not replaced.
- Master Table's Reprint / issue new number button validates the selected printer, reuses an unpassed ticket or issues the next number after all existing allocations, then claims and prints that exact job directly. It does not require visiting Print Queue. Failed or uncertain prints remain recoverable there. Passed source print jobs are cancelled during reissue; client and print history remain retained.
- Print Queue includes name search, the same compact cell/action sizes as Master Table, and Cancel for pending/failed jobs. Cancellation affects only the print request, not the registration or assigned ticket. Claimed jobs require physical-output recovery first.
- Sales Executives sorts by name, dealership, code or status in either direction.

Physical labels, a clean-machine NIIMBOT installation, the installed-app visual recheck of the red-accent flash fix, and the complete three-location walkthrough remain manual acceptance work. See [TEST_DRIVE_TEST_BUILD.md](TEST_DRIVE_TEST_BUILD.md) for setup, build and acceptance instructions.

### Remaining approved requirements and implementation gaps

- Verify the startup/model-availability gate and clear administrator-facing reporting when registration configuration cannot sync. Automatic Settings synchronization currently retries in the desktop background.
- Extend authorized historical browsing/export beyond the Master Table's current **Earlier runs today** view if prior-day lead lookup is required in the app. Database records remain retained.
- Complete the export/confirmation flow around retiring models with registrants and the broader settings/export audit requirements. Soft retirement and CSV backup are present; the full acceptance flow remains pending.
- The header currently reports overall **ticket** count; per-model counts use distinct registrations. An overall distinct-client total remains a separate acceptance item.
- Full raw-data/consent detail viewing and additional languages remain future work; Application/Reservation fields remain optional raw-data fields without queue behavior.
- An independently scheduled cloud Sheets worker is future work. The implemented worker requires the desktop app to be running.

The sections below retain the approved workflow and acceptance criteria. Where an item is pending above, treat it as a requirement rather than a completed feature.

#### Phase 1

## Preserve installation identity during backup restore

Implemented in the manual test build: backups include `data.json`, but restoring them preserves the receiving PC's Instance ID, cloud writer token, and licence binding. The engine retains a safety copy before committing the restored queue state.

The restore workflow restores queue data, configuration, and videos while retaining the destination installation's `instanceId` and `cloudWriterToken`. If destination credentials are missing, fresh credentials are generated rather than imported from the backup.

- Show the source and destination Instance IDs before confirming a restore.
- Warn explicitly when the backup was created by another installation.
- Preserve the destination identity by default; only a deliberate supported migration flow may transfer an identity.
- Add regression coverage for restoring Instance B onto licensed Instance A: A remains licensed and its cloud mirror remains keyed to A.

## Configurable announcement voice

Implemented in the manual test build: TDQSYS uses the locally packaged **Kokoro ONNX** engine, lists its available voices in Settings, and retains `af_heart` as the default and safe fallback. Voice selection, preview playback, and synthesis work locally.

Settings lets an authorised operator select from the Kokoro voices packaged with TDQSYS.

- List the Kokoro voices available in the installed TDQSYS package.
- Retain the current voice as the default and safe fallback.
- Provide a **Test voice** action before saving the selection.
- Store the selected voice in the location configuration.
- If a saved voice is no longer packaged with the app, automatically use the default voice and show a clear Settings notice.
- Keep synthesis local so announcements continue working without internet access.

## Configurable announcement wording

Implemented in the manual test build: an authorised operator can configure announcement wording around the normal queue message, preview it, and test local playback before saving.

Suggested template parts:

- **Prefix** — for example, `Now serving`.
- **Main announcement** — generated from the current queue ticket and destination.
- **Suffix** — for example, `Thank you.`

Templates should support validated placeholders:

| Placeholder | Example value |
| --- | --- |
| `{ticket}` | `A001` |
| `{counter}` | `Counter 3` |
| `{service}` | `Customer Service` |

Design requirements:

- Keep the existing announcement wording as the default template.
- Restrict changes to Settings Edit Mode.
- Include a preview and a **Test announcement** action before saving.
- Validate placeholder names and display a helpful error for invalid templates.
- Preserve current templates during application updates and location migration.
- Consider separate templates and voices for each supported language in a later phase.

## Phase 1 acceptance criteria

1. A selected available voice is used in the next queue announcement.
2. A missing saved voice falls back safely without preventing announcements.
3. Prefix, ticket/destination content, and suffix are announced in the configured order.
4. Invalid placeholders cannot be saved.
5. Revoked or unlicensed installations remain read-only and cannot modify these settings.

#### Phase 2

## Test-drive registration and live queue dashboard

The manual build provides web registration feeding the unified Facilitator Dashboard and the existing customer display.

### Test-drive Settings configuration

All configuration is performed in the installed TDQSYS desktop app. Public
Pages hosts only the client registration form, SE registration form, and queue
displays, together with supporting assets/APIs and existing download/update
metadata. Settings and facilitator/control pages must be blocked online and
must not be linked from the public hub.

Each installation/location has its own client-form QR link, SE-form QR link,
and Google Sheets destination, all scoped by its installation identity. The
facilitator configures that location's Sheet in desktop Settings: create an
empty tracking sheet, share it as Editor with the displayed connection-account
email, paste its URL, test the connection, then save Settings. The desktop
automatically syncs saved configuration; Event Setup also provides **Sync saved Settings now**. The
initial server Google account is configured once; adding another location
must not require another Cloud project, JSON key, code change, or web deploy.

The Sheet URL selects the spreadsheet only. TDQSYS must automatically create
or reuse a tab named **TDQSYS Reg mm/dd/yyyy** (for example, **TDQSYS Reg
11/12/2026**) and prepare the raw-data column headers. The date uses the
location's operating timezone. Same-day queue resets reuse that tab and never
delete its leads; retries after midnight still use the original registration
date's tab. Other tabs and their contents must remain untouched.

In the vehicle configuration table, add a **Printable shortname** column beside each vehicle model's full name. The shortname is configured by the test-drive administrator and must fit the 50 mm × 30 mm queue-ticket header. It is the `[Header]` printed above the assigned queue number; the full vehicle name remains available in the registration form, dashboard, master table, and audit history.

Add two facilitator-editable Settings fields: **Waiver statement** and **Terms and Conditions**. Both are shown in the client form's Consent step and their exact saved versions are recorded with each accepted registration. Seed each field with Lorem Ipsum placeholder text so the public web form never presents an empty waiver or Terms and Conditions statement. The facilitator must replace the placeholders with approved dealership wording before event use.

### Operating day and daily queue numbers

Test-drive queues operate by the dealership's configured local **operating day**. The server, rather than a customer phone, determines the operating day. Every active vehicle model begins a new run's allocation counter at zero; the first committed entry is normally issued queue number `01` (or the configured prefixed equivalent). Live registration, dashboard and Print Queue queries use the active operating day/run, disregarding prior-run registrants without deleting them. At event/day opening, the facilitator uses Event Setup's Reset to Zero to align the local/TV display with the new live queue; the distinct Settings counter reset does not restart registration allocation.

Each operating day may contain one or more **queue runs**. A new day opens its first run automatically. The facilitator's **Reset to Zero** action asks for a reset reason (including **Testing**), closes the current run, and opens a new run for the same day, with each model's live allocation restarted from zero and the active display cleared. This supports testing or an operational restart on the same day without deleting client details, rewriting historical queue numbers, or creating duplicate numbers inside a run. Every test-drive entry, display state, print entry, and reprint decision must carry its queue-run identity.

Historical registrations, queue entries, print history, and lead data must remain available to authorised personnel. A unique database constraint prevents duplicate queue numbers within the same queue run and vehicle model; runs belong to a location and operating day, so a new same-day run may safely start at `01`.

### Sales Executive daily check-in and registration authorisation

Clients may open the web form by scanning its QR code, but may submit only when they are accompanied by a checked-in Sales Executive (SE).

1. At the start of the operating day, each SE completes a separate public SE registration form with their name and dealership. TDQSYS creates the daily check-in and assigns a unique four-digit code for that location and operating day.
2. The client completes the form, waiver, and terms and conditions, then enters the accompanying SE's code.
3. The server validates the active code and returns only the display details needed by the form: the SE's name and dealership.
4. The form pre-fills and displays those details. Its Submit control remains disabled until a valid code has been confirmed and the required waiver and terms acknowledgements are complete.
5. On submission, the registration stores the linked SE check-in and the exact waiver/terms version and consent timestamp.

A four-digit code is an accompaniment check, not a high-assurance identity credential. The generator retries candidates against the database's location/day uniqueness constraint, including codes revoked by an SE reset. Validation uses a server-side hash; an AES-GCM encrypted copy supports authenticated desktop preview/printing. Codes expire at the dealership's local midnight or earlier when reset. Public validation is rate-limited by location and a hashed client/IP key. The client-registration page must not enumerate the staff list, retrieve staff contact information, or gain operator permissions.

The SE Registration page has its own QR code, which an SE scans to open the page on a mobile device. Name and dealership are required. On successful submission, the SE daily check-in and assigned code are recorded in the SE table. The page shows the assigned four-digit code and the message, **“Collect your printed code at the registration booth.”** The desktop Print Queue includes a separate SE-code print entry, with the four-digit code in the same column as client queue numbers; either member of the facilitator team may print it through the NIMBOT B1. The SE code slip fits the SE name within the 50 mm header width and prints the four-digit code at 36pt, twice its previous size. A separate Registered Sales Exec Master List shows name, dealership, operating day, active code and expiry, with search and earlier-day history. Codes remain available only through authenticated desktop operations. Its dedicated confirmed reset requires a reason, deactivates today's codes, cancels unprinted SE slips, and permits fresh same-day registrations. It retains SE history and existing client references, never reuses a previously issued code that day, and leaves client queues and TV numbers unchanged. The Windows installer bundles NIIMBOT driver setup and skips it when a driver or vendor driver package is already registered.

### Registration form

A client completes the web form in this sequence:

1. **Client details:** Email Address (valid email), Name (Firstname Lastname; letters), City Address (letters and numbers), and Contact No. (numbers). All are required. The client selects **Next**.
2. **Test-drive choices:** Unit(s) to Test Drive, populated from the active test-drive models in Settings using their full vehicle names. At least one model is required and multiple models may be selected. **For Application?** and **For Reservation?** are optional. The client selects **Next**.
3. **Consent:** Waiver and Terms and Conditions. Required acknowledgement of each is stored with the accepted document version and timestamp. The client selects **Next**.
4. **SE validation:** The accompanying SE's unique four-digit code. Once validated, the SE name and dealership are pre-filled; they are not selectable from a public dropdown. The client selects **Submit**.

On submission, validate all required fields, the active SE code, and at least one selected vehicle model. Before creating each test-drive entry, search the database for the same client name and vehicle model. If an existing matching entry has not passed, do not create another entry; show **“You are already registered for this car model, your queue number is [queue number].”** If the matching entry has passed, create a new entry and issue a new queue number. A successful submission displays the assigned queue number(s) and **“Registration received—please collect your printed queue number from the facilitator.”**

Email address and contact number are not duplicate-prevention keys. A client may submit another registration on the same day; duplicate handling is based only on matching client name and vehicle model, using the passed-number rule above. The server must still use an idempotency key to ensure an interrupted retry of the *same* submission cannot create duplicate records.

Raw data from webform will be used 2 ways,
1st is to be forwarded to the testdrive queue database for the Test Drive Queue List and Test Drive Dashboard. TDQSYS may retain and display the full raw registration data to authorised users, but **For Application?** and **For Reservation?** are disregarded by the current queue and print workflows; they are retained only for a future use case.
and 2nd is to append the raw client-registration data to the configured Google spreadsheet's **TDQSYS Reg mm/dd/yyyy** tab for giveaway tracking. Google Sheets is client-based, not test-drive-model or queue-number-based: later changes to a client's vehicle models do not update or add a Sheets row. Corrections are not required. The Google Sheets integration must retry silently in the background from a recorded outbox/job; a temporary Sheets failure must not interrupt the client registration flow, create a duplicate registration, or change committed queue numbers.

### Database structure

Use normalized, location-scoped records rather than one physical table per vehicle model. Adding or retiring a model must not require a database schema change.

| Record | Purpose |
| --- | --- |
| `vehicle_models` | Available models, including full name, printable shortname, and active/retired status. |
| `sales_executives` | Sales Executive identity and active status. |
| `se_daily_checkins` | Operating-day check-in, code hash/ciphertext, issue/expiry times and optional reset revocation time. |
| `registrations` | Customer details, consent details, timestamp, and linked SE check-in. |
| `queue_runs` | A numbered live queue session within one operating day, including reset reason, start/end timestamps, and active/closed status. |
| `test_drive_entries` | One row per registration/model: operating day, queue run, queue number, and `waiting`, `ongoing`, `done`, `no_show`, or `cancelled` status. |
| `print_jobs` | Facilitator print/reprint state and attempts for one committed test-drive entry or an SE-code slip. |
| `sheet_sync_jobs` | Reliable delivery status for the Google Sheets giveaway-tracking update. |
| `audit_log` | Recorded operational changes and resets; broader export/settings audit coverage remains an acceptance requirement. |

Every record must be scoped to the TDQSYS installation/location identity. Public QR viewers must never read contact details or these operational records; the existing public queue-state document remains free of personal data.

### Dashboard behaviour

The facilitator's Test Drive Queue List is a current-operating-day board for up to 12 active vehicle models overall. Each model's full name heads its column, followed by the distinct registrant total. A client row contains the prefixed queue number, name, status, and four adjacent action buttons on one line. At most three wide model columns fit across; additional columns scroll horizontally. The model name is inherent in its column and is not repeated in each row.

Each customer row has these actions:

- **Ongoing** — makes that customer the active test drive for that vehicle model.
- **Done** — marks the customer's test drive complete.
- **No Show** — records that the customer did not attend.
- **Call Back** — repeats a configurable announcement for that customer without changing their queue status.

The dashboard also shows live registration totals:

- A total registrant count for each vehicle model.
- An overall total across all vehicle models.

The Facilitator Dashboard is the test-drive queue board; it replaces the old plus/minus controls. Master Table, Print Queue, Registered Sales Exec Master List, and Event Setup / QR Codes are separate desktop pages linked from its header. Each model column shows the full car name and total distinct registrants, then one line per waiting/ongoing entry containing its prefixed queue number, client name, status, and four action buttons. The black dashboard retains its original centered heading/buttons, brand Controls heading, and configured accent line. Each enabled brand has a separate dashboard page. At most three wide model columns fit across; additional models scroll horizontally, supporting up to 12 configured vehicles overall. The overall ticket total remains above the board. A separate authorised detail/master view may show the full raw registration record when needed.

Each vehicle model may have one `ongoing` test-drive entry at a time. Different models may have ongoing clients simultaneously. The facilitator manually selects **Ongoing** beside the next client in that model's queue. This marks the previous ongoing entry for the same model `done`, makes the selected entry ongoing, and updates that model's displayed queue number. Other models remain unchanged. **Ongoing** is the only dashboard action that updates `display_with_ads.html`; the existing plus/minus counter controls are replaced for the test-drive workflow by this action.

### Current desktop pages and initial appearance

| Page | Path and scope |
| --- | --- |
| Primary brand Queue Board | `dashboard.html`; the configured primary brand name appears in navigation. |
| Brand 2 Queue Board | `dashboard-brand2.html`; linked when Brand 2 is enabled. Each board filters its own models and uses its saved brand accent. |
| Master Table | `master-table.html`; agent name/code, current-run search, earlier same-day history, compact reprint/reissue and add/change model actions. |
| Print Queue | `print-queue.html`; printer selection, queue numbers or SE codes in the first column, print attempts and recovery. |
| Registered Sales Exec Master List | `sales-executives.html`; name/dealership search, active codes, expiry, history, active-code reprint and a dedicated confirmed SE reset. |
| Event Setup / QR Codes | `event-setup.html`; both registration QR codes, manual Settings sync, CSV backup and queue-run reset. |
| Compatibility address | `test-drive-operations.html` redirects to the Facilitator Dashboard. |

All of these staff pages are desktop-only and blocked on both public and preview Pages sites. The local engine injects saved brand names and validated colors into the HTML before rendering, using a bootstrap that excludes credentials and client records. The navigation labels, Controls heading and accent therefore appear before cloud registration data arrives. Inter is bundled/preloaded locally, and reserved status-line space avoids shifting the page when run/Sheets messages load. Page HTML is served with `Cache-Control: no-store` so a subsequent navigation uses newly saved Settings.

### Reset controls and retained data

| Control | Effect | Retained data |
| --- | --- | --- |
| Event Setup: Reset to Zero / open run | Requires a reason and confirmation; closes the active run, opens another, restarts model allocation from zero and clears every model's local/TV display number. The first new ticket is `01`. | Clients, original ticket numbers, earlier runs, SE check-ins and lead records. |
| Settings: Reset Display Counters Only | Clears display counters; it does not start a new registration run or restart ticket allocation. Settings links to Event Setup for a complete operational reset. | Registration data, allocation counters, runs and SE codes. |
| Sales Executives: Reset Sales Executives | Requires a reason and confirmation; deactivates today's codes, cancels their unprinted slips and allows fresh same-day SE registration. Previously issued codes remain reserved for that day. | SE history and client links; client queues, the active run and TV numbers are unchanged. |

The SE history filter includes previous days and reset registrations. A reset code is shown as inactive rather than exposed as a usable code. Operational resets do not delete marketing leads.

Every new test-drive entry begins as `waiting`. A facilitator may transition it to exactly one of `ongoing`, `done`, or `no_show`; a changed-model entry may additionally be marked `cancelled` before a new entry is created. **No Show** is a facilitator marker only: if that client later returns, issue a new queue number rather than changing the no-show entry. A queue number is considered **passed** when it is lower than the number currently displayed on `display_with_ads.html` for the same vehicle model and queue run. Passed numbers may not be reprinted or edited.

### Call-back announcements

Selecting **Call Back** beside a customer's name announces the following fields in order:

`{callback_prefix} {queue_number} {callback_suffix} {car_model}`

Example:

> Test driver AA01, please stand by, you are next in line to test the Toyota RAV4.

`callback_prefix` and `callback_suffix` are Settings fields that an authorised operator can configure. Neither field may be blank; validation must prevent saving an empty or whitespace-only value. Provide a **Test call-back announcement** control in Settings.

The queue number is read from the committed test-drive entry. The car-model name is read from the related vehicle-model record or model configuration; it must never be typed manually by the dashboard operator.

Vehicle-model records should be created, activated, or soft-retired safely when available test-drive models change in Settings. On application startup, validate that every configured active model is available to registration and dashboard queries, and display a clear administrator-facing error if the check cannot complete.

### Customer-display integration

Selecting **Ongoing** updates the existing customer display with that registration's assigned queue number in its vehicle-model column. Selecting another customer for the same model completes that model's preceding active record first. Each vehicle model has at most one ongoing client; the display retains the current numbers for all other models.

#### Phase 3

### Facilitator-managed queue-ticket printing

After a successful registration submission, commit all selected-model queue entries and create one **pending print entry** for each selected model. Do not print automatically from the web form.

The TDQSYS desktop app provides a shared **Print Queue** page for the two-person facilitator team operating one laptop. Either team member may print, reprint, cancel, reissue, or add a model; separate per-person permissions are not required for this workflow. It shows queue number or SE code in the first column, then name, model/type, print status and actions. A client who selected three models has three separate print entries, one for each ticket. The facilitator prints one entry at a time. A successful Windows spool submission records `printed` and removes the job from the active list. The backend also supports `handed_over`; a separate handover button is not currently exposed. Physical label output must be checked during printer acceptance.

Claiming a print entry must be atomic, so an accidental double-click or later multi-device use cannot print the same ticket simultaneously. Print states should include at least `pending`, `claimed`, `printed`, `failed`, and `handed_over`.

**Target printer:** NIIMBOT B1 label printer, selected from the installed Windows printer list. The desktop uses Electron's native print API. The supplied NIIMBOT driver setup is bundled with TDQSYS and skipped when a driver/package is already registered; a clean-machine installation and physical label output still require acceptance.

- Create and commit all selected-model queue records before starting any print job.
- Print one queue number for every vehicle model selected by the client. For example, selecting three models produces three queue entries and three printed queue numbers.
- Each printed item must identify the relevant vehicle model and show the queue number assigned by that model's table or queue record.
- The NIMBOT B1 label size is **50 mm × 30 mm**. Its layout is the configured printable shortname `[Header]` on the first line and `[Queue no.]` below it. The latest approved layout auto-fits the bold model shortname like the SE name and uses the same 36pt size for the complete prefixed queue number; exceptionally long values shrink to fit.
- Keep the client label to the approved two-line `[Header]` and `[Queue no.]` layout. Registration timestamps remain in stored records. SE slips use the SE name as an auto-fitted header and the four-digit code at 36pt, preserving leading zeros.
- Use the configured NIMBOT B1 label printer; provide a clear retry/reprint action when it is unavailable, disconnected, offline, or out of labels.
- A print failure must not discard the submitted registration or issue a different queue number on retry. The failed entry remains visible in the facilitator Print Queue until it is printed or deliberately cancelled.
- Reprinting is initiated from an authorised master table by searching for the client name. The Master Table action prints directly to its selected printer without requiring a separate Print Queue visit. Reprint the original queue number only while that number has not yet been passed. Once it has been passed, create a new queue entry and issue a new number instead; never alter the previous assigned number.
- If a registered client returns to add or change a model, the facilitator finds the existing registration rather than requiring the client to submit the form again. Adding a model creates a new entry and queue number. Changing a model preserves the prior entry in history, marks it as `cancelled` with an audit reason, and creates a new entry and queue number for the requested model.
- The Test Drive Queue List, Print Queue, and customer display show only the active queue run. The Master Table also defaults to the active run, but provides an **Earlier runs today** filter and name search for audit and lookup. Earlier-run entries are read-only: they cannot be resumed or reprinted. A returning client may instead be issued a new entry in the active run with a new queue number.
- Record print status and time for operational troubleshooting and audit purposes.
- Design and test the label layout for the printer's selected label size, including a readable queue number and vehicle-model name.

#### Phase 4

### Lead-data retention, cleanup, and reset safeguards

Implemented 6 November: see the run-scoped giveaway resets and safe history
cleanup section at the top. It supersedes the earlier carry-forward policy.

Registration records are client marketing leads, not disposable queue numbers. The future implementation must preserve and protect this data accordingly.

When an operator changes the available vehicle models in Settings, the system should soft-retire models that are no longer offered. If a retired model contains registrants, the operator must first be offered an export/backup of those registrants and must explicitly confirm any archival or deletion action. Historical model identity and its linked registrations must remain intact unless a separate, deliberate retention action permits deletion.

Announcement prefix, suffix, callback prefix, and callback suffix values may be replaced when saved in Settings. Changes should be auditable and should not alter previously stored registration records, queue history, or printed-ticket data.

The daily operating-day boundary opens a new queue run; a same-day **Reset to Zero** closes the active run and opens another. Neither action deletes or alters historical registrations. Reset to Zero must never silently remove lead data. Before any exceptional reset, archive, or deletion takes place:

1. Offer a backup/export of all registrants, including contact details, selected vehicle models, queue numbers, statuses, timestamps, and print information.
2. Clearly state whether the action resets only the live queue counters or also archives/deletes historical registration records.
3. Require explicit confirmation after the backup option is presented.
4. Keep a reset audit record with the operator, timestamp, scope, and backup/export outcome.

The preferred default is to close the current operating day while retaining historical registrations in an archive that can be exported by authorised client personnel. Permanent deletion of marketing leads should require a separate, deliberate data-retention action rather than being coupled to an operational queue reset.

### Workflow acceptance criteria

1. A client can select one or more models and receives a queue entry for each selected model only after entering a valid, active daily SE code and accepting the required waiver and terms.
2. Submitted entries appear in the matching model list without manual refresh.
3. Each vehicle model has at most one ongoing test-drive entry, and selecting Ongoing updates only that model on the existing customer display.
4. Selecting a new ongoing customer atomically marks the prior ongoing customer for that same model as done and updates that model's display.
5. Done and no-show records remain auditable but are clearly separated from waiting customers.
6. Two operators cannot accidentally create two ongoing records for the same model through simultaneous clicks.
7. Client-side validation, server-side validation, and appropriate access controls protect contact details.
8. A successful form submission creates one pending facilitator print entry per selected vehicle model, using the queue numbers committed to the database.
9. Retrying a failed print never creates duplicate registrations or changes an assigned queue number, and two facilitators cannot claim the same print entry simultaneously.
10. Call Back announces the saved queue number and model name without changing the customer's queue status.
11. Callback prefix and suffix cannot be saved empty, and the generated announcement follows the required field order.
12. Startup validation ensures every configured active vehicle model is available to registration and dashboard queries before actions are accepted.
13. The dashboard displays an accurate total for every vehicle model and an accurate overall registrant total.
14. Retiring a model structure containing registrants requires a backup/export offer and explicit operator confirmation before its data can be removed.
15. A new operating day starts each model's first queue run from zero while prior-day registrants remain available only in authorised historical views and exports.
16. A same-day Reset to Zero closes the active queue run, records the reason and time, then opens a new run starting from zero without deleting or altering prior-run registrations, queue numbers, print records, or audit history.
17. Historical registrant data remains available for authorised marketing use after a normal live-queue reset.
18. The client-registration form cannot submit without every required field, at least one selected vehicle model, required consents, and a validated active SE code.
19. A client who selects multiple models receives a separate queue and Print Queue entry for each selected model.
20. The active Print Queue shows queue number or SE code, name, model/type, print status and actions; successfully printed entries no longer appear there.
21. A passed queue number is never edited or reprinted. Reissue, added-model, and changed-model actions create new queue entries while preserving the original entry and an audit record.
22. An SE code expires automatically at the dealership's local midnight, even if the SE has not checked out.
23. A Google Sheets failure is retried silently in the background and never blocks a successful committed registration or changes its queue numbers.
24. An SE can open the daily registration form from its QR code, submit a required name and dealership, and receive a NIMBOT-printed slip containing their name and unique four-digit code.
25. The client form follows the required Details, Test-drive Choices, Consent, and SE Validation steps; only Application and Reservation are optional.
26. Google Sheets receives one immutable raw client-registration row per successful client submission. Later model or queue changes do not create or modify a Sheets row.
27. A No Show entry remains an auditable marker; a returning client receives a new queue entry rather than a changed no-show number.
28. The 50 mm × 30 mm client label prints the bold, larger Header above the Queue no. The SE slip auto-fits the name and prints the four-digit code at 36pt.
29. Reset to Zero clears only the active test-drive display and opens a new queue run with a fresh live allocation cursor; it never deletes client details or rewrites historical queue numbers.
30. Queue numbers are unique within a location, operating day, queue run, and vehicle model; a same-day reset may therefore safely allocate a new run's `01`.
31. Reset to Zero records a reason, including Testing, and a timestamp before opening the new queue run.
32. The Master Table defaults to the active run and permits earlier same-day runs to be searched for audit or lookup only; reissue creates a new active-run entry.
33. Each active vehicle model has an administrator-configured printable shortname used as the bold ticket header, while the client form and operational records retain the full vehicle name.
34. Settings provides non-empty Waiver statement and Terms and Conditions fields, seeded with Lorem Ipsum placeholders; each accepted registration records the exact versions shown to the client.
35. A daily SE code is generated only after checking issued codes and enforcing database uniqueness for that location and operating day; the successful SE page shows the code and directs the SE to collect the printed slip.
36. A successful client submission displays every assigned queue number and directs the client to collect the printed queue number from the facilitator.
37. Before issuing a duplicate name-and-model entry, the server checks whether an existing number has passed. An unpassed entry is shown to the client; a passed entry allows a new number. Email address and contact number do not block another registration.

#### Phase 5

## Technical blueprint

This section describes the implemented private Supabase data model,
public registration endpoints, and desktop-only operational bridge. It does
not expose registration data through the existing public `queue_state` record
or QR queue viewer.

### Storage model

Every record is scoped to the TDQSYS installation/location identity, either
directly by `instance_id` or through its queue-run/registration foreign key.
The server assigns identifiers, timestamps, operating days, and
queue numbers; no phone-provided value is trusted for those fields.

| Table | Required fields and purpose |
| --- | --- |
| `vehicle_models` | `id`, `instance_id`, `full_name`, `printable_shortname`, `active`, `retired_at`. The active models drive the client form; do not physically delete a retired model with history. |
| `sales_executives` | `id`, `instance_id`, `name`, `dealership`, `active`, `created_at`. This is the durable SE directory created by the daily SE form. |
| `se_daily_checkins` | `id`, `instance_id`, `sales_executive_id`, `operating_day`, `code_hash`, `code_ciphertext`, `issued_at`, `expires_at`, `revoked_at`. Hashes enforce validation/uniqueness; ciphertext supports private code previews/printing. At most one non-revoked check-in exists per SE/day; an SE reset preserves older rows and permits a fresh one. |
| `queue_runs` | `id`, `instance_id`, `operating_day`, `run_number`, `status`, `opened_at`, `closed_at`, `reset_reason`, `opened_by`. Exactly one run is active per location. |
| `queue_counters` | `queue_run_id`, `vehicle_model_id`, `last_issued_number`. This row is locked and incremented when a new ticket is allocated; it starts at zero for each run and model. |
| `registrations` | `id`, `instance_id`, `full_name`, `name_search`, `email`, `city_address`, `contact_number`, `for_application`, `for_reservation`, `se_daily_checkin_id`, `waiver_version`, `terms_version`, `consented_at`, `submitted_at`. Raw client information lives here. |
| `test_drive_entries` | `id`, `instance_id`, `registration_id`, `queue_run_id`, `vehicle_model_id`, `queue_number`, `status`, `replaced_entry_id`, `issued_at`, `status_changed_at`, `status_changed_by`. An entry is never edited to reuse a number. |
| `print_jobs` | `id`, `instance_id`, `kind` (`client_ticket` or `se_code_slip`), `test_drive_entry_id` or `se_daily_checkin_id`, `status`, `claimed_at`, `printed_at`, `handed_over_at`, `attempt_count`, `last_error`. |
| `display_state` | `instance_id`, `queue_run_id`, `active_test_drive_entry_id`, `updated_at`. Private latest-Ongoing event context; it is not a location-wide single-ongoing restriction. |
| `queue_model_display` | `queue_run_id`, `vehicle_model_id`, `queue_number`. Persists the last displayed number per model/run and is used for passed-number/reprint decisions. |
| `sheet_sync_jobs` | `id`, `registration_id`, `payload_snapshot`, `status`, `attempt_count`, `next_attempt_at`, `last_error`, `completed_at`. It appends one raw client-registration row to Google Sheets. |
| `audit_log` | `id`, `instance_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `details`, `created_at`. Transactions record operational changes, including queue/SE resets, issues and status changes. Broader settings/export auditing remains an acceptance requirement. |

### Database rules and transactions

- Enforce unique SE codes by `instance_id`, `operating_day`, and `code_hash`.
- A confirmed SE reset revokes current-day check-ins without deleting them, expires their codes and cancels unprinted SE slips. A partial unique index allows a new check-in for the same SE/day after revocation; daily code uniqueness includes revoked rows to prevent reuse.
- Enforce one active queue run per `instance_id` and one unique ticket by `queue_run_id`, `vehicle_model_id`, and `queue_number`.
- Enforce no more than one `ongoing` test-drive entry per vehicle model within the active location/run.
- Ticket allocation locks the matching `queue_counters` row, increments it, creates the test-drive entry and pending client print job, then commits all of those changes together.
- A same-day Reset to Zero transaction closes the active run, clears its display state, creates the next `run_number`, creates its zeroed model counters, and writes an audit record. It never updates previous entries' queue numbers.
- Selecting Ongoing atomically changes the same model's previous ongoing entry to `done`, marks the chosen entry `ongoing`, updates `display_state` and `queue_model_display`, and writes its audit record.
- Duplicate-name/model checking, passed-number logic, reissue, add-model, and model-change actions execute on the server inside a transaction. Model changes cancel the original entry and create a new entry; they never mutate its assigned number.

### Endpoint boundary

Public Pages forms call dedicated registration endpoints. These endpoints use
server-side credentials and return only data safe for the caller. They never
return the TDQSYS writer token, service-role key, full SE list, operational
queues, or another location's data.

| Endpoint/action | Caller | Result |
| --- | --- | --- |
| `GET /api/test-drive/config?id=<instanceId>` | Public client form | Returns that location's active model names and waiver/Terms text/version hashes. |
| `POST /api/test-drive/se-checkins` | Public SE QR form | Validates name/dealership, creates daily SE check-in and pending SE-code print job, returns the assigned four-digit code and collection message. |
| `POST /api/test-drive/se-code` | Public client form | Rate-limits code checks and returns the active SE's name/dealership or an error. |
| `POST /api/test-drive/registrations` | Public client form | Revalidates the code, required fields, consent versions and models server-side; applies duplicate-name/model logic; commits entries, print jobs and a Sheets job. Returns existing unpassed or new numbers and the collection message. |
| `snapshot` | Private desktop bridge | Reads the active-run board, Print Queue and optional earlier same-day entries. Explicit staff-view flags include private code previews and the SE master list. |
| `ongoing`, `status`, `callback` | Private desktop bridge | Advance the chosen model, mark allowed status changes, or fetch a ticket for a local speech announcement. |
| `reset` | Private desktop bridge | Requires a reason; closes the active run and opens a new run, then clears every model's local/TV number. |
| `reset-sales-executives` | Private desktop bridge | Requires explicit confirmation/reason; deactivates today's SE codes without changing client queues or TV numbers. |
| `printers`, `print` | Native desktop actions | List Windows printers or claim one job, spool a 50 x 30 mm label and record its outcome. |
| `claim-print`, `print-result` | Private desktop bridge | Atomically claim a job or record printed, failed, handed-over or recovery results without reallocating its ticket. |
| `reissue` | Private desktop bridge | Reprint an unpassed ticket, issue a new number, add a model, or cancel/replace a waiting model while preserving the original entry. |
| `configure`, `sync-sheets` | Desktop foreground/background work | Publish saved location Settings or retry a durable raw-registration delivery job. |
| `integration-info`, `test-sheets` | Desktop Settings bridge | Display the sharing-account email and check/prepare the selected spreadsheet's dated tab without exposing credentials. |

Desktop pages call the whitelisted `af:testDrive` Electron IPC bridge. The
native process sends private operations as a JSON `action` to
`POST /functions/v1/test-drive-operations` on Supabase, using the installation's
writer credential over TLS. The function authenticates that credential against
`instance_id` and checks revocation; the native bridge also enforces the local
licence write gate. Public form scripts receive neither credential nor service key.

Selecting Ongoing maps the returned model to the desktop's brand/unit slot,
saves its committed number through the local engine, and triggers the existing
queue-sync mirror. Local and remote `display_with_ads.html` continue reading
the established queue-state feed. No client details are added to that public
feed. Run reset uses the same local/TV update path, clearing all model slots.

### Background work and failure handling

- The registration transaction writes a `sheet_sync_jobs` record without waiting
  for Google Sheets. The desktop main process runs its retry worker every 15
  seconds while TDQSYS is open, independently of the active facilitator page.
  Jobs persist while the app is closed and resume when it reopens. There is no
  independent scheduled cloud worker in the current build.
- Saved models, waiver/Terms and Sheet URL sync automatically. A newly saved
  destination is configured before delivery is retried. When no URL is saved,
  registrations stay queued and the staff pages show a setup notice.
- Delivery failures retry silently with backoff. The worker checks the
  registration ID in the destination before appending to prevent duplicate
  delivery, uses the original submission date for its daily tab, and leaves
  existing rows and unrelated tabs intact.
- A NIMBOT failure updates its `print_jobs` record to `failed`; the committed
  registration and queue number remain unchanged. The desktop can retry from
  that job only when its associated entry remains unpassed.
- A public form submission supplies an idempotency key. Repeating the same
  interrupted request returns its original result rather than allocating new
  numbers.

### Required automated coverage

1. Simultaneous SE registration cannot assign the same four-digit code.
2. A retried submission with the same idempotency key creates neither another registration nor another ticket.
3. A multi-model registration creates exactly one entry and print job for each selected model.
4. Two Ongoing actions for the same model cannot leave two entries ongoing or update its display inconsistently; different models may remain ongoing simultaneously.
5. A same-day Testing reset creates a new run, starts from zero, and preserves earlier-run records.
6. An unpassed ticket reprints unchanged; a passed ticket is reissued with a new entry and number.
7. No-show and changed-model flows retain the original entry and audit history.
8. A failed NIMBOT job and a failed Google Sheets job retry without changing committed registration or queue data.
9. Public endpoints cannot retrieve PII, operations, staff lists, or another location's records beyond their permitted response.
10. Unlicensed, expired, revoked, and reinstated desktop states keep the required write restrictions.
11. SE reset deactivates old codes, permits fresh same-day check-in, preserves client/run/display state, and never reassigns a revoked code that day.
12. Installer driver detection skips an existing NIIMBOT driver/package and bundles the supplied vendor setup for a clean installation.
13. Every facilitator page receives saved brand metadata before its CSS/scripts render; Brand 2 uses its own accent, credentials are excluded, and status/font loading does not cause the default-red flash.
