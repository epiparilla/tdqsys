# Test-drive manual-test build


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

Manual acceptance: record one giveaway in a disposable run, reset/open a new
run, confirm stock and claims zero/Unclaimed, then enter opening stock again.
Check old-run dashboard history remains intact. Test daily rollover similarly.
For cleanup, use disposable runs only: preview and cancel first; verify wrong
phrase, active-run selection and changed-data rejection. Only deliberately
confirm deletion after saving the private backup. Confirm Sheets and Settings
are unchanged; shared retained clients remain; Clean slate starts Run 1.

Last reconciled with the local source and recorded test results: **6 November 2026**.

Latest built multi-item installer:
`app/dist-test-drive-20261106-multi-giveaways/tdqsys-test-drive-1.1.28.exe`.
Giveaways now has **Manage items** instead of the single dropdown. Select distinct
items in the checkbox dialog, then **Give selected items**. No quantity inputs;
one of each item per registration. Issued items are checked/locked permanently
in this workflow; out-of-stock choices are disabled. Rows show recorded item
chips or Unclaimed. Existing claims and opening/replenishment history survive.
There is no longer a clear/replace/return action in Giveaways; historical return
figures remain on the dashboard. Original registration/Sheets data stays intact.

The whole batch commits or nothing does. Duplicate/cross-window requests cannot
issue the same item again or oversell stock. Uncertain requests retain a safe
retry ID across reopening/restart; a replayed receipt warns to verify handover
before dispensing again. Definitively rejected batches can be reselected. Test
two items for one registration, locked duplicate prevention, an additional item
later, an unavailable-item batch, refresh during selection and retry after a
lost response. Confirm stock/dashboard deduct one unit per newly issued item.
Timestamp and clipping changes remain included. Backend deployed/read-only
verified with live stock preserved and no test claims. 324 Node passing /
3 skipped, 28 PostgreSQL checks, 16 speech tests. Visual/manual acceptance
pending; desktop version and updater remain unchanged.

Latest built Giveaways layout installer (packaged JS/CSS verified against source):
`app/dist-test-drive-20261106-giveaway-layout/tdqsys-test-drive-1.1.28.exe`.
Timestamp format is dd/mm/yyyy hh:mm:ss, 24-hour, in the location timezone.
Email column is narrower (128 px visible text / preferred 140 px column); vehicle
text clips at 180 px. Ellipsis and hover show full unchanged email/model values.
321 Node tests pass / 3 skipped; visual acceptance pending. All preceding stock,
dashboard and speech features are included. Multi-item giveaway selection is
only a proposed checkbox/Manage items flow; the current one-item rule is unchanged.

Latest built inventory/dashboard installer (successful build; packaged UI/native
bridge verified against final source):
`app/dist-test-drive-20261106-stock-dashboard/tdqsys-test-drive-1.1.28.exe`.
Includes every prior change below. New Settings editor: **Item | Beginning
balance / replenish | Total beginning balance**. Enter opening quantities and
Save Configuration; wait for the recorded totals. Opening is recorded once.
Use +, enter quantity inline, then Add stock for replenishments. Stock history
shows each receipt. Total beginning balance is opening plus all replenishments;
remaining stock is shown separately on Live Dashboard. Stock carries across
dates and queue resets. Names/opening quantities lock once recorded; removing
items keeps history. Replenishment retries reuse the same request ID.

Giveaway selections now deduct one unit and cannot exceed stock. Changing or
clearing a selection restores its previous item. No starting stock is guessed:
configure opening balances before dispensing. The **Live Dashboard** page has
current/historical run selection, registration/queue/giveaway totals, tables and
bar charts per model/item, and remaining inventory. New form registrations are
counted once in their first ticket run; queued clients and per-model clients are
unique registration IDs, not ticket totals. Given/Restored/Net distinguish
corrections. Closed-run stock uses the closing balance, not today's stock.
Pre-tracking history is limited to recoverable saved selections.

Test opening stock, + replenishment, retry after connection loss, final-unit
exhaustion, selection correction, same-day reset, historical-run selection and
later stock additions not changing an earlier closing balance. No live test
receipts, claims, registrations or resets were performed during implementation.
Backend deployed/read-only verified with 7 runs; data counts unchanged. 320 Node
passing / 3 skipped; 26 PostgreSQL checks; 16 Python speech tests. Visual/manual
acceptance pending; version/updater remain unchanged.

Latest built installer:
`app/dist-test-drive-20261106-giveaways/tdqsys-test-drive-1.1.28.exe`.
Includes the new **Giveaways** page and all previous changes below. Set giveaway
items in Settings, one per line, save, then open Giveaways. The app syncs options
automatically. All rows initially show Unclaimed; choosing an item saves it.
Raw columns match the original Google Sheets submission without its Registration
ID column. One row per registration, including earlier queue runs today; adding
models/reissuing tickets never adds giveaway rows. Queue resets do not reset
claims. New-day view shows that day's submissions; earlier records stay saved.
Removing an item from setup preserves prior selections. Search by client name.

Giveaway loading/saving requires a connection. If a write is not confirmed,
refresh before dispensing; stale-window overwrites are rejected. No test claims
were made against live clients. Backend/migration deployed and read-only checked:
12 rows today, all Unclaimed. Automated checks: 316 Node passing / 3 skipped,
22 PostgreSQL integration checks and 16 Python speech tests. Visual/manual
acceptance pending. Version and public update metadata remain unchanged.

Latest speech change: **whole-sentence clips**, replacing segmented production
playback. Kokoro generates each complete Announcement / Call Back in one pass,
using existing wording, voice and vehicle pronunciation hints. No segment joins.
Persistent cache: `audio_cache/sentences-v1`; old caches remain for rollback.
Each model prepares 01–50 for both actions, extending through 100 at displayed
25, through 150 at 75, and so on. Warmup yields between clips to live jobs and
previews. Existing cached audio does not wait for background rendering.

After installation or changing voice/wording, check the preparation progress in
Settings / facilitator pages. Cold or out-of-range tickets may need rendering;
instant playback applies only to already cached clips. Test Announcement and
Call Back, navigation during playback, per-model batch extension, Settings
changes and restart cache reuse. Physical fluency/latency acceptance is pending.
310 Node passing / 3 skipped; 16 Python speech tests passing. Packaged verifier
passed preview/live byte equality and native FIFO with playback suppressed.
Whole-sentence installer built successfully (packaged speech executable and UI
verified against final staging):
`app/dist-test-drive-20261106-sentences/tdqsys-test-drive-1.1.28.exe`.
This incorporates the table formatting and Sheets setup changes below.

Sales Executives table now matches Master Table / Print Queue: shared 12 px
cell/header text, 7 px by 6 px cell padding, and 11 px action buttons with 4 px
padding / 2 px margins. Behavior is unchanged. Full Node suite: 309 passing,
3 skipped, no failures; visual acceptance pending. Latest built installer
(successful exit, packaged CSS verified byte-identical to source):
`app/dist-test-drive-20261106-tables/tdqsys-test-drive-1.1.28.exe` (also includes
the Google Sheets relocation). Version/updater remain unchanged.

6 November UI change: Google Sheets setup now lives on **Event Setup / QR Codes**,
not Settings. Existing destinations load automatically. Share as Editor, test
the connection/prepare today's tab, then click **Save Google Sheets URL**.
No separate Settings save is needed. The URL-only save preserves queue counters
and unrelated configuration; the existing app-wide sync/retry worker is unchanged.
Regression suite: 308 passing, 3 skipped, no failures. Visual/manual acceptance
remains pending. Built manual installer:
`app/dist-test-drive-20261106-sheets/tdqsys-test-drive-1.1.28.exe` (packaged
engine and changed pages verified byte-identical to source);
version remains 1.1.28 with no updater release or public deployment.

This local file is the current manual-test guide. Approved requirements,
implementation gaps and release gates are tracked in
[FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md). Keep this guide and both
roadmap copies updated locally before committing/pushing documentation changes.

The released desktop and public update manifest remain at **1.1.28**. This
development build is installed manually; it must not replace the released
GitHub assets or `public/version.json` before acceptance.

## Restore point

Explicit phoneme audition, 6 November: open
`outputs/tdqsys-phoneme-audition-20261106/ex-prefix/index.html` for the focused
EX correction comparison after user reported "LI EKS": original, unstressed,
short-vowel notation and separately rendered letters. Only prefix audio varies;
original context WAVs match byte-for-byte. Listening choice pending; app untouched.

Original six-pair comparison:
`outputs/tdqsys-phoneme-audition-20261106/index.html` for six same-voice pairs
and isolated prefix/model clips. Only those two components use proposed IPA
with explicit phoneme mode; numbers/wording and production speech are unchanged.
Listen before approving an implementation; this is not a new installer.

Client presentation, 5 November: the requested fresh demo records are 10 SEs,
20 clients and 27 tickets, verified against today's cloud records and daily
Sheet. Preserve them for testing. The local client-facing package is
`outputs/TDQSYS Client Presentation 2026-11-05/`; it contains 20 screenshots,
a three-page Word walkthrough and screenshot index. Existing records, queue
numbers, Settings and installed speech behavior were not reset or changed.

Segmented Pocket audition: open
`outputs/tdqsys-voice-audition-20261105/segmented.html` to compare the same voice
and wording as whole sentences or independently cached segments. Eight pairs
use the real planner/stitcher and 10 ms joins; production audio is unchanged.

Separate audition, 5 November: open
`outputs/tdqsys-voice-audition-20261105/index.html` for 14 complete-sentence WAVs
comparing Pocket TTS with Kokoro. Start/Stop launchers in that folder control
only the local Pocket tester on port 8012; no new TDQSYS installer is needed.
Judge fluency, exact ticket digits, leading zeros and model names. This is not
an engine replacement, and no listening or concurrent-load acceptance is claimed.

Latest user feedback, 3 November: live announcements are now instant. The
current test records include 10 SEs, 20 clients and 27 tickets, with all 20 raw
client rows verified in `TDQSYS Reg 11/03/2026` without duplicates. Keep them
for testing; do not rerun automatically. Fluency remains under discussion:
full-sentence caching has not been implemented. A six-sample `am_liam`
generation benchmark averaged 7.088 seconds per complete clip; generation
under concurrent app load and full-sentence listening acceptance are pending.
See `SESSION_HANDOFF.md` for the saved discussion and next decision.

- Source checkpoint: `90d0ee7`, tag `checkpoint-v1.1.28-pre-test-drive`.
- Backup branch: `backup/v1.1.28-pre-test-drive`.
- Released installer remains `app/dist-installer/tdqsys-setup-1.1.28.exe`.
- New manual installer: `app/dist-test-drive/tdqsys-test-drive-1.1.28.exe`.
- Installer bundles the signed `dist/NiimbotPrinterDriverInstaller-3.0.2.1.exe`
  in `resources/drivers`. It checks machine printer-driver registrations and
  vendor package registrations first. Existing NIIMBOT installations are skipped;
  otherwise the vendor setup opens with elevation for printer-model selection.
  Cancelling driver setup leaves TDQSYS installed and permits a later retry from
  that folder. TDQSYS uninstall does not remove system printer drivers.
- Back up the installation's queue state/videos through existing Settings
  before manually installing on a test laptop. Use a test location identity
  for registration testing rather than borrowing a live location's identity.

## Implemented paths

- Local working queue: Ongoing/status changes are durably recorded in
  `test-drive-<instanceId>.json` in the desktop data directory. Ongoing updates
  the local TV number and queues speech without waiting for the cloud. Call
  Back uses the local ticket/model snapshot. Both work with cached current-run
  records during a connection outage; initial use requires one successful sync.
  Background replay uses operation IDs and cloud receipts, so lost responses
  and restarts do not apply transitions twice. Pending overlays survive stale
  snapshots. New registrations still arrive from cloud polling.
  Printing/reissue/reset and other dependent cloud mutations sync pending
  statuses first and require connectivity. The online viewer and registration
  duplicate checks use the last synced state during an outage.
  The sync message shows pending/offline/conflict state. Retry saved actions
  after fixing a current-run rejection. Export local recovery from Event Setup
  before reviewing/archiving earlier-run actions. No registration is deleted.
  Backups include the local journal as a recovery sidecar. Restore keeps it in
  `local-queue-recovery` rather than replaying older or foreign operations.
- Settings: printable model shortnames, waiver, Terms, callback wording, and
  Google Sheets URL.
  Add dealership options one per line under Test-drive configuration. Save to
  sync them to the location's agent registration dropdown. Until this list is
  configured, new SE registrations are paused; existing codes/clients remain
  valid. Removed options do not rewrite historical dealership records. The
  list accepts up to 200 names, each at most 160 characters, without duplicates.
  Vehicle rows have a Shortname pronunciation field directly after shortname,
  with a separate preview button. It supplies the spoken model name in Call
  Back and `{counter}`; a blank field keeps the full model name. Prefix speech
  remains controlled by the existing prefix-pronunciation field.
- Local speech: packaged Kokoro voice list, safe fallback, prefix/main/suffix
  templates, validated placeholders, and voice/announcement/call-back previews.
  Test announcement and Test call-back announcement now use exactly the live
  segmented planner/cache/stitcher, with ticket 01 and the current unsaved
  Settings values. Matching saved values/ticket produce byte-identical WAVs.
  Previews do not save Settings, change queues or enqueue physical playback;
  the Settings page auditions the returned audio. Background preparation yields
  to previews. Both preview/live paths use 10 ms joins instead of 50 ms, with
  speech speed unchanged at 1.0. Individual cached clips remain valid.
  Ongoing and Call Back now queue a private desktop-owned FIFO player. It
  prepares separate phrase, model/prefix and number clips, stitches PCM audio
  and keeps playing while facilitator pages change. Clips persist by text,
  voice and speed; changed Settings prepare new clips. Numbers 00-150 are
  prepared initially, with an additional range ahead of the displayed number.
  Missing clips can require synthesis after startup or Settings changes.
  The packaged cached assembly probe measured a 3.34 ms median; this excludes
  cloud action time and physical speaker startup. Actual listening remains required.
  Updating queue means committing queue status/display state; Queuing announcement
  means handing Call Back to the desktop player. Table refresh runs afterward.
- Backup restore: source/destination identity confirmation, destination licence
  and writer-token preservation, and a retained queue-state safety copy.
- SE registration: daily code, encrypted slip storage, printed-slip queue.
- Client registration: four steps, consent text hashes/snapshots, SE prefill,
  server-side code revalidation, retry identity, and per-model tickets.
- Facilitator Dashboard (`dashboard.html`): active-run model board with
  Ongoing/Done/No Show/Call Back actions. Search, reissue and model changes are
  on Master Table; CSV backup and queue-run reset are on Event Setup / QR Codes.
  Each model has its own ongoing client and display number.
- Master Table (`master-table.html`) and Print Queue (`print-queue.html`) are
  separate desktop pages linked from the dashboard. The former Test Drive
  Operations address redirects to the dashboard; the old plus/minus board is
  replaced. Each model column shows its full name, unique registrant total,
  then ticket prefix/number, client name, status and four actions on one line.
  Master Table also shows the linked agent name and four-digit code, including
  earlier same-day run entries, with compact action controls.
  Its name/agent/model/status sorter supports both directions. Model selections
  and focused dropdowns survive background refresh. Choose a printer on Master
  Table: Reprint / issue new number now prints directly, reusing an unpassed
  number or allocating after the highest issued number when passed. A passed
  01 with 02 displayed and 03/04 issued creates 05 and cancels the obsolete 01
  print request. Print failure preserves the ticket for Print Queue recovery.
  Add/change model continues to queue its separate new label.
  Print Queue searches client/SE names, matches Master Table's compact sizing,
  and permits cancelling pending/failed print requests without cancelling
  clients or tickets. Claimed jobs retain their physical-output recovery flow.
  Sales Executives sorts by name, dealership, code or status, both directions.
- Branded dashboard: the original centered heading/button layout and black
  background are restored. Each brand has its own Controls heading and accent
  line. Brand 2 gets `dashboard-brand2.html` only when enabled in Settings.
  Up to three wide vehicle columns fit across; extra models scroll horizontally.
  Each client's number, name, status and four buttons share one line.
  The horizontal track loops seamlessly with no Previous/Next buttons or visible
  scrollbar. Overflowing models repeat on both sides with identical live actions;
  whole-cycle recentering preserves the visible content across either seam.
  Use mouse wheel, trackpad, touch scrolling, mouse drag or focused-board arrow
  keys. Refresh and resize preserve the position; dragging defers board rebuilds.
  Models that already fit the available width are not repeated.
  Unchanged snapshots retain the existing columns. Wheel and drag updates are
  combined per animation frame; QR images are generated only on Event Setup
  when their links change. Startup resize keeps local bootstrap branding,
  correcting the red fallback that appeared before the first cloud snapshot.
- First-render branding comes directly from the local engine's saved config
  in the HTML response, before styles and page scripts run. Brand 2 gets its
  own saved accent immediately. The local bootstrap contains only brand names,
  colors and a Sheets-configured flag. Private credentials are excluded. The
  facilitator pages bundle Inter locally and reserve status-message space;
  their appearance no longer waits on cloud snapshots or Google Fonts.
- Event Setup / QR Codes (`event-setup.html`) and Registered Sales Exec Master
  List (`sales-executives.html`) are dedicated desktop pages. The SE list shows
  name, dealership, operating date, expiry and active code, with search/history.
  SE codes appear in Print Queue's queue/code column, including leading zeros.
  The SE label keeps its four-digit code at 36pt (twice the previous 18pt) and
  fits the name within the 50 x 30mm label without shrinking the code.
  Active codes have a Reprint button that queues a slip in Print Queue,
  preserving its original code. An already pending/failed slip is reused;
  a claimed slip requires output recovery first. Expired/reset codes cannot reprint.
  Client labels now use the same auto-fit approach for the model shortname
  and the same 36pt number size, including the full prefix and minimum two
  digits (AA01; AA100 stays complete). Exceptionally long values shrink to fit.
- The SE page has a dedicated confirmed reset with a required reason. It
  deactivates today's SE codes, cancels their unprinted slips, and allows fresh
  same-day SE registrations. History and client references are retained; old
  four-digit codes are not reassigned during the same operating day. It does
  not reset client queues, the queue run, or the TV display.
- Printer list comes from the installed Windows printers. A successful spool
  submission removes a ticket from pending. Physical output must be checked
  during hardware acceptance; spool success alone cannot detect empty labels.
- A claimed job whose outcome could not be recorded has manual recovery
  controls. Check physical output before choosing Confirm printed or Retry.
- Google Sheets jobs retain a raw submission snapshot, retry with backoff,
  and check Registration ID before appending after an interrupted request.
  Model changes/reissues do not change the original Sheets row.

## Cloud prerequisites

### Recorded cloud verification through 2 November 2026

The additive schema, private operations function, Google service-account
secret, and matching Pages/Edge encryption secrets are now deployed. The
working registration preview is:

`https://test-drive-preview.tdqsys.pages.dev`

A live probe passed SE registration/code validation, client registration,
idempotent retries, duplicate ticket handling, private SE code previews/master
list, encrypted SE slip retrieval, Ongoing, same-day reset/history, and the
dedicated SE reset with fresh same-day registration and unchanged client queues.
Google Sheets connection/delivery checks also passed. The probe's
disposable location records and temporary Google tab were removed afterward;
the real giveaway tab was left untouched. No physical printing was attempted.

For the manual test installation, set **System Settings > Cloud Base URL** to
the preview address above, paste the selected Google Sheets tab URL, and save.
Open System Settings from the installed TDQSYS app on the laptop. There is no
online setup page: Cloudflare blocks Settings, the facilitator dashboard, and
Test Drive Operations URLs. Only the registration forms and public queue
displays are intended for online users.
Open **Event Setup / QR Codes** from the facilitator header for registration QR codes.
The same page now contains the read-only queue mirror link, Copy button and
mirror QR downloads in PNG/SVG. These sharing controls were removed from
Settings; the immutable Instance ID remains there. Check that scanning or
downloading the mirror QR opens `client.html?id=<this installation ID>`.
Saved models, waiver, Terms and Sheets destination sync automatically in the
desktop background process. **Sync saved Settings now** also remains available.
Choose the installed label printer on the separate **Print Queue** page.
The main website and preview both block desktop Settings and facilitator
pages. Release assets and the update manifest remain at their checkpoint
state; this website restriction does not modify already installed apps.

The steps below remain a deployment reference for future environments.

### User setup for three independent locations

Each laptop keeps its own installation identity. Its client and SE QR links
contain that identity, so the same hosted form pages provide three separate
client-form links and three separate SE-form links without separate deploys.

On each laptop, open desktop System Settings, create an empty Google tracking
spreadsheet for that location, and share it as Editor with the email displayed
under **Share with this account**. Paste the spreadsheet URL, select
**Connect Sheet / prepare today's tab**, then save Settings. The desktop syncs
the destination automatically; **Sync saved Settings now** is also available
on Event Setup / QR Codes. Repeat with a different Sheet at the other two locations.
TDQSYS creates or reuses **TDQSYS Reg mm/dd/yyyy** using the location's local
date, and initializes its column headers. No manual tab creation is needed,
and any `gid` in the pasted URL is ignored. Same-day queue resets reuse the
same daily tab. Jobs retried after midnight still target their registration
date, preserving the original raw record. Existing tabs are never deleted.
Keep Editor permission enabled so TDQSYS can create tabs and write rows.

The existing server account is reused, so facilitators do not need to create
Cloud projects, service accounts, API keys, or JSON files. Sheet URLs, models,
waivers, SE codes, queue runs, and registrations are stored per location.
The established public queue display flow remains unchanged.

1. Authenticate the Supabase CLI for the existing project
   `pnyptdyfkftrcgjlaqnr` using `npx supabase login`.
2. Apply `supabase/migrations/202611010001_test_drive_platform.sql` once, after
   the existing queue-state migration. It creates separate private tables and
   does not change the released app's public queue mirror.
   Then apply `202611010002_per_model_ongoing.sql`, which enforces one ongoing
   client per vehicle model rather than one across the whole location.
   Apply `202611020001_sales_executive_reset.sql` for revocable SE check-ins
   and the history-preserving SE reset transaction.
   Apply `202611020002_ticket_labels_se_reprint.sql` for complete client label
   metadata and the location-scoped SE reprint transaction.
   Apply `202611020003_direct_reprint_cancel.sql` for explicit passed-ticket
   decisions, exact reprint job IDs and scoped print cancellation.
   Apply `202611020004_registration_dealerships.sql` for location dealership
   lists, atomic Settings synchronization and server-side SE selection checks.
   Apply `202611030001_local_operation_sync.sql` for private idempotent
   operation receipts and scoped background replay.
3. Deploy `test-drive-operations` with the accompanying `supabase/config.toml`
   JWT-verification setting. Its own authorization checks the installation's
   existing writer token and remote revocation record.
4. Configure the **same** base64-encoded 32-byte
   `TEST_DRIVE_CODE_ENCRYPTION_KEY` secret for the Pages registration endpoint
   and Supabase operations function. Keep the key out of source and binaries.
5. Pages needs the existing `SUPABASE_URL` and server-side
   `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`). Use a preview
   deployment for initial testing and configure those values in its preview
   environment. Set the test installation's Cloud Base URL to that preview
   URL so its registration QR codes open the test forms.
6. Supabase needs `GOOGLE_SERVICE_ACCOUNT_JSON` for silent Sheets writes.
   Enable the Sheets API for that service account and share the selected
   spreadsheet with its `client_email`. Pasting a URL selects a destination;
   it does not grant write permission to a private spreadsheet.
7. Paste the spreadsheet URL into Settings. TDQSYS automatically prepares its
   dated tab and eleven column headers beginning with Registration ID. A tab
   whose existing columns do not match is preserved and reported for review.
   [Google Sheets tab operations](https://developers.google.com/workspace/sheets/api/samples/sheet).

The retry worker runs every 15 seconds while the desktop app is running,
independently of its current page. A newly saved Sheets URL is configured
before queued registrations are retried. Without a URL, registrations remain
in the durable outbox and the facilitator pages show a setup notice. Jobs
resume after reopening the app; an independent cloud worker is not installed.

## Build and verification

The supplied driver installer must exist at
`dist/NiimbotPrinterDriverInstaller-3.0.2.1.exe` before building. This binary
is excluded from Git; the build copies it into `resources/drivers`. The
driver-bootstrap script and NSIS hook are tracked under `app/build/`.

```powershell
node tests\run.js
npm.cmd install --prefix .dev-db --no-package-lock --no-audit --no-fund @electric-sql/pglite
node tests\test-drive-db.integration.js
python -m unittest discover -s tests -p speech_segments_test.py
npm.cmd run --prefix app build:installer -- --config.directories.output=dist-test-drive --config.nsis.artifactName=tdqsys-test-drive-1.1.28.exe
```

The extra integration runner executes the migration and its database functions
using an isolated PostgreSQL runtime. The normal suite remains dependency-free.
See [PGlite execution API](https://pglite.dev/docs/api).

Latest automated verification: 305 passing Node tests, three optional skips,
21 PostgreSQL integration checks and nine Python speech tests. The rebuilt packaged speech engine was
checked with actual synthesis, its 54-voice catalog, saved selection, and
missing-voice fallback. Desktop/public route boundaries passed on both sites.

These are recorded results. The red-accent flash fix was packaged and checked
with engine/DOM regression tests; its installed-app visual acceptance remains
part of the walkthrough below.

## Remaining implementation and acceptance items

- Verify the startup model-availability gate and clear reporting when saved
  registration configuration cannot sync. Background Settings retries exist.
- Prior-day lead browsing/export, full raw-data/consent detail viewing, broader
  settings/export auditing, model-retirement export/confirmation flows, and an
  overall distinct-client total remain tracked in the roadmap.
- Sheets delivery requires the desktop app to remain open. An independent
  scheduled cloud worker is not installed.
- Physical labels, clean-machine driver installation and full acceptance at all
  three locations must pass before raising the release version or manifest.

## Required manual acceptance at each of the three locations

1. Install manually; confirm the licence and existing display/video behavior.
2. Select the actual label printer and its 50 x 30 mm stock; verify clipping,
   header/number sizes, printing failures, and recovery with physical output.
3. Save vehicle shortnames, real waiver/Terms, and Sheets URL; open
   Event Setup / QR Codes and download its two QR images. Confirm Sheets setup is shown
   clearly and a saved destination enables background delivery.
4. Register an SE on a phone, print its code slip, register a client for
   multiple models, and collect the separate labels.
5. Exercise Ongoing, Done, No Show, Call Back, duplicate submission, reprint,
   passed-number reissue, add/change model, and Master Table search.
   Keep two different models ongoing, then advance one: only that model's
   previous client should become Done, and the other model must remain ongoing.
6. Reset during the same day. Confirm new numbers begin at 01, old entries are
   read-only in Earlier runs today, and prior client details remain intact.
   Event Setup's reset opens a new run and resets every model and the TV display
   to zero, while retaining SE check-ins. The older Settings reset is explicitly
   labelled Display Counters Only and does not restart registration allocation.
7. Disconnect/reconnect the internet and printer, check silent Sheets recovery,
   confirm one Sheets row per original submission, and confirm another
   location cannot see this location's clients.
8. In Settings, select a packaged Kokoro voice, test it, and save. Check the
   next queue and call-back announcements. Edit the prefix/main/suffix using
   `{ticket}`, `{counter}`, and `{service}`; invalid placeholders must refuse
   saving. Test voice, announcement, and call-back previews locally.
9. Back up a test installation, then restore it on another test installation.
   Check the source/destination ID warning and confirm the receiving PC keeps
   its Instance ID, cloud writer credentials, and licence. Its previous queue
   state is retained as a `data.before-restore-*.json` safety copy.
10. On a clean Windows test machine, confirm bundled NIIMBOT setup opens and
    registers the selected driver. On the next install, confirm it is skipped.
    Existing-driver detection passed on the developer PC without changing its
    driver; an actual clean-machine driver installation still needs acceptance.
11. From Sales Executives, confirm a dedicated reset invalidates old codes and
    enables fresh registrations. Check reset entries in history, and confirm
    existing clients and the ongoing TV numbers stay unchanged.
12. Navigate repeatedly among the Queue Board, Master Table, Print Queue,
    Sales Executives and Event Setup / QR Codes. Confirm the saved brand accent,
    brand name and navigation labels appear on the first render with no red
    default flash or status-text jump. Repeat after changing/saving the accent
    in Settings and with internet disconnected. If Brand 2 is enabled, confirm
    its separate board immediately uses its own saved accent. Registration data
    may still be loading; local page styling must already be correct.
13. Start Ongoing and Call Back, then navigate to Master Table, Print Queue,
    Sales Executives and Event Setup while speech plays. It must finish without
    interruption. Queue another announcement: FIFO playback must finish the
    first before starting the next. Check complete prefixed speech, saved
    wording/voice, latency after startup and after changing speech Settings.
14. Check agent name/code in Master Table. Reprint an active SE from its page,
    then print the queued slip. Print client AA01 and a three-digit ticket;
    verify complete numbers, fitted model headers and physical 50 x 30mm output.
15. Allocate 01-04 for one model, select Ongoing for 02, then click Master
    Table's Reprint / issue new number for 01. It must issue and print 05
    directly. Reprint an unpassed ticket: its number must stay the same and
    print directly. An invalid printer must prevent allocation; a failed
    spool must leave the exact issued ticket recoverable in Print Queue.
16. Choose another model and wait through at least two refreshes, then Add
    model. The choice must remain. Exercise Master Table and Sales Executive
    sorters in both directions; search Print Queue by client/SE name. Cancel
    a pending label and verify its registration/ticket remain in Master Table.
17. Scroll through every vehicle column using mouse wheel/trackpad, touch,
    mouse drag and focused-board arrow keys. There must be no navigation buttons
    or visible scrollbar. The last model must flow directly into the first in
    either direction without a visible end-to-start jump. Repeat across many
    cycles and during background refresh/resize. Click actions on repeated
    columns and confirm they operate on the correct model/client only once.
    Change a model prefix/pronunciation in Settings:
    preview text must show its compact ticket; speech must use its pronunciation.
18. Save two dealership options in desktop Settings. Scan the SE QR, check
    that both appear in a required dropdown, and register with one. Remove
    that option: new forms must omit it, but existing codes/clients and history
    must remain valid. An empty list must show a setup message and disable new
    SE submission. Repeat with different lists at another location.
19. Save a model shortname pronunciation, preview it, and test Call Back and
    a template containing `{counter}`. Reload Settings and restore a test backup
    to check it persists. Confirm printed shortname and prefix pronunciation
    remain correct. Navigate repeatedly during initial cloud loading and
    resize the board; saved accent must remain visible without a red flash.
20. Use Test announcement and Test call-back announcement with a saved voice,
    model pronunciation and wording. Compare live ticket 01 for that model:
    cadence and joins must match. Try unsaved edits, listen, then leave without
    saving: live wording/voice must remain the saved values. Check that shorter
    joins remain clear, including prefix, leading zeros and model names. The
    Test voice button remains a separate general voice audition.
21. With current-run clients cached and audio prepared, disconnect the laptop's
    internet. Select Ongoing, Done/No Show and Call Back; local rows, TV numbers
    and speech must respond without waiting for a cloud request. Keep another
    model ongoing and confirm it stays unchanged. Close/reopen the desktop
    while offline: accepted statuses and pending operations must remain saved.
22. Reconnect. Pending counts must clear, cloud statuses must match local
    statuses, and the online viewer must catch up. Retry/restart after a lost
    acknowledgement: each transition must be applied only once. Printing and
    reissue must drain the journal before using cloud passed-number decisions.
23. In a disposable test location, reset/change the cloud run while operations
    are unsynced, or cross midnight offline. Old-run actions must not affect the
    new run. Export recovery and archive earlier-run actions explicitly; keep
    all registration history. Check licence rejection/reinstatement and Retry.
24. Cross the location's midnight with nonzero TV numbers, including with the
    laptop offline. Every configured model must show zero without needing a
    cloud response; restart must retain zero and history must remain available.
    Reconnect/load today's run and confirm zero stays until an Ongoing action.
    A restart during the same current run must preserve that run's displayed
    numbers rather than resetting them again. The online viewer catches up
    once connectivity returns.

The local native-helper check measured approximately 80 ms for local save,
display projection and speech enqueue with zero cloud calls. This excludes
physical speaker startup and FIFO/cold-audio waits; listening remains required.

This installer is a development artifact. Live cloud, physical printer,
three-location, and manual installation acceptance remain required before a
production release version is increased.
