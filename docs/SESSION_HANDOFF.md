# TDQSYS session handoff

Updated 9 November 2026, Asia/Manila. This is a conversation handoff summary,
not a verbatim transcript.

## Resume here


## 9 November printed waiver agreement

Added a second, separate required checkbox beneath waiver acceptance:
"I agree to sign a printed copy of this waiver."
It starts unchecked and appears only when the saved waiver contains text.
Clearing the waiver hides and disables both waiver checkboxes, preserving the
optional-statements workflow and three-step flow when both texts are blank.
Terms acceptance and first-page Data Privacy Consent remain unchanged.

The browser sends printedWaiverAccepted, and server validation requires the
literal boolean true for populated waivers before ticket allocation. When it
is missing/false, the server reads the location's text rather than trusting
client flags. Older already-open forms may need reloading to see the new box.
This is agreement to sign later, not confirmation of an actual signature.
No new database/Google Sheets column or historical consent backfill added.

377 Node checks pass / 3 skipped, including unchecked/default visibility,
browser step blocking and server bypass checks. Packaged files verified;
physical/browser visual acceptance is pending.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-printedwaiver-20261109/tdqsys-v2-setup-2.0.0.exe
Install manually for the local form; reload the v2 online client form after
deployment. Local guides synchronized; no live statements, registrations,
v1 assets or OTA settings changed. No database migration required.


## 8 November optional Waiver and Terms questions

Desktop Settings now permits empty Waiver and Terms & Conditions text.
Empty/whitespace-only text hides that statement, heading and acceptance
checkbox in the client form; the checkbox is disabled and not required.
If both are blank, Next and Back skip the consent step and progress shows
three steps. If either contains text, that statement still requires explicit
acceptance. The separate first-page Data Privacy Consent remains required.

Blank values survive Settings reload and desktop background configuration
sync (no Lorem Ipsum replacement). Existing missing settings retain the
original placeholder default. Submission validation determines optionality
from server-loaded location text, never from client-supplied required flags.
Existing version hashes still reject stale text; blank snapshots and their
SHA-256 versions remain recorded without fabricating checkbox acceptance.
No Google Sheets layout change.

375 Node checks pass / 3 skipped; 38 isolated PostgreSQL checks pass.
Coverage includes all four text combinations, blank/whitespace navigation,
required populated statements, server-side bypass rejection, Settings reload,
empty snapshot persistence and stale versions. Packaged files verified;
physical/browser visual acceptance remains pending.
Applied 202611080002_optional_registration_statements.sql to the existing
backend: removed only the two non-empty text checks, preserving NOT NULL,
defaults, existing statements, registrations, versions and history.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-optionalconsent-20261108/tdqsys-v2-setup-2.0.0.exe
Install manually, clear the desired statements in Settings and save. Reload
the v2 online client form after deployment. No live statement was cleared
automatically. All prior fixes retained; v1, OTA and live records unchanged.


## 8 November Master Table status highlights

Master Table rows now highlight Done in green (#123d26) and Ongoing in orange
(#663600), with white text and the existing written status retained. Every
render rebuild tags rows from their current status, so Ongoing-to-Done changes
update the color too. Waiting, No Show and Cancelled retain their previous
appearance. This also applies when viewing earlier-run rows.
Status actions, sorting, search, printing and all data remain unchanged.

372 Node checks pass / 3 skipped, including a rendered-row status-transition
regression. Packaged files verified; physical visual acceptance is pending.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-masterstatus-20261108/tdqsys-v2-setup-2.0.0.exe
All previous display-scale refinements remain included. Install manually;
this is a desktop-only Master Table change, with no remote-viewer deployment
required. Local guides synchronized; v1, OTA and live records unchanged.


## 8 November display scale fine-tuning, revision 2

Relative to the preceding display-scale build: logo height increases 100%
(2em to 4em), car labels decrease 25% (scale 2 to 1.5), and the complete
prefixed number increases 25% (scale 0.5 to 0.625). Both TV and remote viewer,
including portrait/landscape phone breakpoints, share these multipliers.
Logo width cap doubles to 1920px while retaining the 80vw viewport limit.
Padding, aspect ratio, logo pixels, brand text size and print labels remain
unchanged. Automatic row/viewport sizing and queue-font fit stay active.

371 Node checks pass / 3 skipped. Source regression and packaged-file checks
verify the changes; physical display/visual acceptance remains pending.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-displayscale-r2-20261108/tdqsys-v2-setup-2.0.0.exe
Install manually for the local TV display; reload the v2 remote viewer after
deployment. Local guides synchronized; v1, OTA and live records unchanged.
This revision supersedes the scale values in the preceding entry below.


## 8 November display scale adjustment

TV and remote viewer now use twice the previous logo height (2em), twice
the car-label font size and half the complete prefixed queue-number font
size. Desktop, portrait-phone and landscape-phone rules share the same
multipliers. The prefix retains its existing proportion within the number.
Automatic viewport/row sizing and custom queue-font fit remain active.
Logo width limit doubles to 960px, still constrained to 80vw on small screens.
The full image, its supplied padding and aspect ratio remain untouched.
Brand text size, font choices, print labels and saved settings are unchanged.

371 Node checks pass / 3 skipped. Source regression checks cover every size
breakpoint and padding preservation; physical display acceptance is pending.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-displayscale-20261108/tdqsys-v2-setup-2.0.0.exe
Install manually for local TV changes; reload the v2 remote viewer after
deployment. No version bump, OTA notification, v1 change or live data reset.
This supersedes the original-size restoration below; cropping stays disabled.


## 8 November client logo padding restored

Client-supplied logo padding must be preserved. Reverted the automatic
transparent-padding crop for existing logos and new uploads, and restored
the original 1em logo height and width limits. The three production branding
files match their pre-cropping version (34fb140) exactly. Upload preparation
still resizes the complete image proportionally to fit the existing compact
PNG storage limit; it never trims the canvas or changes its aspect ratio.

Logo-to-screen ratio tuning is the next step, not part of this restoration.
No new scale setting or increased logo size has been introduced. Saved
settings are not rewritten. If a logo was uploaded and saved while cropping
was enabled, re-upload the original asset to recover its supplied padding;
padding already removed from a saved image cannot be reconstructed.

370 Node checks pass / 3 skipped, including a padding-preservation regression.
Verification here is source/test and packaged-file verification, not a new
physical display or visual acceptance check.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-logopadding-20261108/tdqsys-v2-setup-2.0.0.exe
Reload existing v2 remote viewer tabs after deployment; install the manual
build for local display changes. No live settings, queues, registration or
giveaway records changed. Earlier installers, presentation R2, v1 and OTA
remain unchanged. All other v2 fixes and bundled fonts are retained.



## 8 November bundled display fonts and brand logos

Bundled the supplied GEELY-Bold.ttf, Inter-Variable.ttf and
LynkcoType-Medium.ttf byte-identically under public/fonts. They ship inside the
installer and the v2 site; Windows font installation is not required.
Desktop Settings > Brands & Cars now has per-brand font-type selectors for
Brand name, Car label and the complete prefixed queue number. System default
retains the previous appearance; display font sizing is still automatic, with
custom queue fonts measured to fit the available card without following the
transient Ongoing animation scale. Font loading and viewport resizing refit.

Each brand can choose text or an uploaded logo. PNG/JPEG/WebP files up to 4 MB
are rasterized/resized to a compact PNG (maximum 32 KiB, up to 512 x 128 pixels,
aspect ratio retained); transparent PNG is recommended. Only PNG data is saved
with the location configuration, never a local path or external URL. This
keeps logo selection portable to the online mirror and strips source metadata.
Text remains the brand identity/fallback. Remove logo restores text mode.
Invalid logos/fonts are rejected on save/restore. Appearance-only edits save
without the vehicle queue reset prompt; no queue numbers or records reset.

TV and remote viewer use the same renderer/fonts and rebuild on appearance
changes. Both brands retain independent settings. Supplied fonts also appear
in existing ticket-font controls: prepared print/preview documents embed the
selected font bytes and await fonts before fitting the fixed 50 x 30 mm label.
No live setting, registration, queue, giveaway record or printer job changed.

369 Node checks pass / 3 skipped. Isolated Electron checks cover Settings
collection/rehydration, a real sample image-upload path, seven/twelve-car TV
layouts, independent two-brand mirroring, coarse-pointer phone layout and all
three fonts in self-contained label rendering. Visual screenshots inspected;
physical label output still needs acceptance. Local configured mirror URL was
verified to point to tdqsys-v2.pages.dev. V2 viewer/assets deployed; reload an
already-open mirror after installation to load the new viewer code.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-brandfonts-20261108/tdqsys-v2-setup-2.0.0.exe
Install, enter Edit Mode, choose fonts/logo per brand and Save Configuration.
Includes earlier recovery, privacy-form and shutdown changes. V1 and OTA stay
unchanged. Earlier installers and client presentation R2 are preserved.



## 8 November required client Data Privacy Consent

The first client-registration step now starts with an unchecked required
Data Privacy Consent checkbox using the user's exact statement:
I agree to the collection and use of my information in accordance with the
Data Privacy Act of 2012.

Native first-step validation blocks Next until accepted. The final submit
handler rechecks consent and sends privacyAccepted as a boolean; the public
v2 registration API rejects anything other than explicit true before accessing
the database. Existing waiver, Terms and Agent-code requirements remain.
This is an additional consent gate; no dedicated privacy audit column or new
Google Sheets/table column was added, and historical records are unchanged.

361 Node checks pass / 3 skipped. The isolated Electron form check confirmed
unchecked blocks Next and checked allows vehicle selection. No registration
was submitted and no live records were modified. V2 form/API deployed; users
with an already-open older form should reload. No new desktop installer is
needed for the online form; local staged server resources were updated too.
The latest desktop installer remains the queuefix build. V1 and OTA are
unchanged. The client presentation R2 predates this checkbox addition.



## 8 November Queue Board vehicle mapping recovery

Fixed the board remaining on the default Car 1 while Settings and the TV show
the configured vehicle list. A stale cached display projection failed its
mapping guard before the background worker could fetch a fresh snapshot.
The worker now continues synchronization after a projection failure and retries
display application afterward. Fresh model IDs/names/brand/slot changes, or
orphaned pending projection metadata, invalidate only the derived projection
context. The next projection uses fresh model displays plus any durable local
outbox overlay. Safety guards still refuse to write a number to the wrong car.

No run reset, queue-file deletion, registration cleanup or manual live-data
repair was performed. Unsynced actions, history and registrations remain
intact; offline mismatches stay pending for recovery. Model list ordering alone
does not trigger a rebuild. Staff windows are notified of model-list changes.
359 Node checks pass / 3 skipped, including five new recovery regressions;
the tests reproduced both failures before the fix and passed afterward.
Existing instant local-announcement and offline-midnight-reset tests pass.

Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-queuefix-20261108/tdqsys-v2-setup-2.0.0.exe
Includes all earlier font-preview, header and shutdown fixes. Quit from the
system tray, install manually, reopen and allow connected background sync to
refresh the vehicle list. No Reset to Zero is required. Actual installed-app
recovery awaits the user's acceptance check. Earlier installers, v1 and OTA
remain unchanged; no cloud schema or Pages deployment is required.



## 8 November client presentation revision 2

Updated local presentation package:
outputs/TDQSYS Client Presentation 2026-11-08 R2/
Shareable archive:
outputs/TDQSYS v2 Client Presentation 2026-11-08 R2.zip

Six-page Word walkthrough and 30 regenerated PNG screenshots now show Agent
terminology, compact frozen headers/table controls, and the fixed 50 x 30 mm
ticket font controls with live Client/Agent print previews. Offline Screenshot
Index.html and Read Me.txt are included. Earlier presentation files remain
unchanged. All people, contacts, dealership examples, codes and QR links in
these captures are fictional. No live registration, printer job, giveaway,
Google Sheet, installed-app setting or queue record was changed.

All six document pages and all screenshot contact sheets were inspected.
Native LibreOffice rendering was attempted but soffice.exe is unavailable;
visual QA used the existing isolated Electron docx-preview renderer. This is
not native Word/PDF, physical printer, speaker or OTA acceptance. Presentation
outputs remain local/untracked and are not intended for the public repository.



## 8 November ticket font settings and live preview

Desktop Settings now includes Ticket printing, with separate Client queue ticket
and Agent code formats. Each header and number/code has font family, size,
bold and italic controls; alignment is configurable per label type. Six listed
Windows fonts are supported. Defaults retain Arial, bold 24pt header / 36pt
number, with automatic shrinking when necessary to fit complete text.
Paper size remains hard-coded at 50mm x 30mm in both HTML and the Windows print
job (50000 x 30000 microns); there are no editable paper dimensions.

A live side preview uses exactly the same renderer and fitting code as actual
printing. It samples the first configured model shortname and prefix + 01, or
an editable sample Agent name and 0042. The sample name is never saved. Controls
are side-by-side on normal desktop windows and stack on narrow windows. Save
Configuration applies both formats; Cancel/Relock restores saved formats.
Formatting-only edits do not reset queues or trigger the brand-layout reset
prompt. Engine save/restore validates formats; malformed stored values safely
fall back to defaults in the renderer. No actual print jobs were generated.

354 Node checks pass / 3 skipped. An isolated engine verified persistence,
unchanged queue values and rejection of an invalid save without mutation.
Read-only Electron checks verified Settings collection/rehydration, responsive
screenshots, and 12 maximum-size label fits across six fonts and both types.
Physical NIMBOT output still needs a print acceptance test on 50 x 30mm stock.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-ticketfonts-20261108/tdqsys-v2-setup-2.0.0.exe
Includes the earlier header and process-tree shutdown fixes. Earlier installers
and live data are preserved. V1 and OTA remain unchanged. This is desktop-only;
no cloud backend changes are needed. Existing presentation files are unchanged.



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

Contact update deployed to production Pages (deployment 0a2e6822); both live
forms and invalid-input API rejection verified without writing registrations.
Database migration applied. Installer built successfully, 232,692,773 bytes;
three packaged form assets verified byte-identical to tested source.

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

### Multi-item giveaways approved and implemented on 6 November

User approved the proposed Manage items flow. Giveaways now uses a native HTML
dialog (not window.prompt) with one checkbox per configured item, remaining
stock, already-issued checked/locked rows and out-of-stock disabled choices.
There are no quantity inputs. Checking boxes does not write anything; Give
selected items commits the entire batch. Rows show item chips or Unclaimed;
timestamp formatting, email/model clipping and raw fields remain unchanged.
Refreshes preserve drafts and the open panel. Removed claimed items stay visible.

New `registration_giveaways` records uniquely identify registration + item, with
an additional case-insensitive uniqueness index. `giveaway_issue_requests`
stores canonical batch payloads/results for idempotent retries. Validate all
items/stock first, then insert claims and one positive stock-ledger event per
item in one transaction under the existing location/run/stock locks. No partial
batch on exhaustion or duplicate claims; no extra deduction on request replay.
The immutable claim records survive queue resets and app restarts. Uniqueness
is per REGISTRATION, not email/name or across separate form submissions.

Current legacy selections backfill without new stock deductions. The scalar
giveaway_item is retained as a first-item compatibility field; original Sheet
payloads are never changed. The old single-item endpoint can issue a first item
but now refuses clearing/replacing locked claims. The former correction/return
UI is intentionally superseded by the approved locked-item policy. Analytics
already counts per-item ledger units; historical Restored totals are retained.

Uncertain requests persist a location/registration-scoped batch UUID in local
storage across restart; Retry pending issue reuses it. Definite 4xx rejection
(except throttling) releases the batch for reselection. Replayed confirmation
warns to check prior handover, not dispense twice. Stock changes/retirement do
not hide a pending batch. Native bridge carries server HTTP status without
exposing credentials. Issuance remains licensed and authenticated; new tables
and RPC explicitly deny anon/authenticated roles.

Migration `202611060003_multi_item_giveaways.sql` and private operation endpoint
deployed. Read-only live check: 12 registration rows, 5 configured/stock items,
0 issued items. Totals unchanged: 73 registrations, 103 tickets, 73 Sheet jobs,
6 stock events; 0 claim events, multi-claims or issue requests. User-created
stock receipts were preserved. No live registration simulation, reset, stock
addition or giveaway issuance was performed for this implementation.

Tests: 324 Node passing / 3 skipped; 28 PostgreSQL checks; 16 Python speech tests.
Database integration suite applies the multi-item migration after checking the
previous single-item correction policy, explicitly testing the upgrade and new
locked-item rules. Build completed successfully:
`app/dist-test-drive-20261106-multi-giveaways/tdqsys-test-drive-1.1.28.exe`.
Includes all preceding changes. Packaged UI/native bridge verified byte-identical
to tested source; physical/visual UI acceptance remains pending. Version/updater
remain 1.1.28, with no Pages deployment or automatic installation.

### Giveaways timestamp/clipping and multi-item UI discussion on 6 November

Giveaways timestamps now display exactly dd/mm/yyyy hh:mm:ss (24-hour time) in
the location timezone, default Asia/Manila. Midnight/date-rollover tested.
Email text is clipped to 128 px in a preferred 140 px column; selected vehicle
text is clipped at 180 px. Ellipsis/full hover title; original strings stay in
the DOM and database/Sheets data is unchanged. Node: 321 passing / 3 skipped.
Manual installer built successfully (packaged timestamp/clipping JS and CSS
verified byte-identical to source):
`app/dist-test-drive-20261106-giveaway-layout/tdqsys-test-drive-1.1.28.exe`.
Visual acceptance pending; no backend, version or updater change.

User asked HOW a multi-item giveaway UI would work, not to implement it yet.
Proposed: replace single dropdown with Manage items; checkbox list of distinct
configured items, already-issued entries checked/locked and out-of-stock choices
disabled. Explicit Give selected items commits new selections; row shows item
chips, or Unclaimed if none. No quantity controls. Future backend needs unique
registration/item claims and atomic stock checks/deductions for the batch; a
UI-only restriction cannot guarantee no duplicate dispensing. Current single-
item claim/inventory rules remain unchanged until approved.

### Giveaway inventory and Live Dashboard on 6 November

Settings giveaway editor now has exactly three columns: Item, Beginning balance
/ replenish, Total beginning balance. Enter opening quantity and Save
Configuration; the persisted idempotent opening plan is applied by the app-wide
configuration worker. Opening balance is recorded once per location/item.
After recording, the item name/opening quantity are read-only; retire/re-add items
without deleting history. The + button opens INLINE replenishment controls in
column two (no native prompt dependency). Enter quantity and Add stock. Stock
history lists timestamp, item, opening/replenishment and quantity. Third column
is read-only total supplied (opening plus replenishments), NOT remaining stock.
Receipt/claim history carries across days and queue resets; it is not reset by
Reset to Zero. Replenishments retain pending request UUIDs in location-scoped
localStorage and retries cannot increment stock twice, including after restart.

Stock events and claim/correction events are private, append-only application
ledgers. Selection deducts one; clearing/changing restores the former item.
Location advisory locks prevent overselling and coordinate with queue resets.
Insufficient stock rejects the whole change, preserving the previous selection.
Existing selections are backfilled without inventing initial stock. No real
stock quantities or claims were written during implementation/smoke checks.

New desktop-only `live-dashboard.html` / Live Dashboard nav link provides
current and all historical run selection, cards, per-model table/bar chart,
giveaway and remaining-stock charts, and item inventory table. New registrations
are attributed once to their FIRST ticket run. Queued clients and per-model
clients deduplicate registration IDs, while issued-ticket counts remain separate.
Giveaway Given/Restored/Net cards clarify corrections. Run inventory shows balance
at start, stock added, units issued/restored and remaining at close/current time.
Closed-run balances exclude later receipts. Uninitialized stock is labeled rather
than guessed; pre-tracking history includes only recoverable saved selections.
Refresh is 5 seconds while visible; no CDN/chart dependency and no speaker changes.

Migration `202611060002_inventory_dashboard.sql` applied via the same CLI db
query flow, and private test-drive-operations deployed. A BEFORE queue_runs
boundary trigger uses actual clock time for FUTURE opens/closes after lock
waiting, not transaction-start NOW(); existing run timestamps stay untouched.
This fixes stock/reset overlap; first-ticket attribution also handles runs opened
inside a submission transaction. Both browser roles are explicitly denied the
new tables/RPCs, while the private writer-token service remains authorized.

Verification: 320 Node passing / 3 skipped, 26 PostgreSQL checks (including stale
claims, idempotent receipts, exhaustion, historical freeze and delayed reset
boundary), 16 Python speech tests. Read-only live checks found 7 runs, 12 new /
queued registrations and 8 models; a historical run closing balance passed.
Totals unchanged: 73 registrations, 103 tickets, 73 Sheet jobs, 0 claims and 0
stock events. No simulated registrations or resets were run against live data.
Ignored smoke helper: `.dev-db/verify-inventory-dashboard-live.cjs`.

Final manual installer built successfully (packaged UI/native bridge verified
byte-identical to final source):
`app/dist-test-drive-20261106-stock-dashboard/tdqsys-test-drive-1.1.28.exe`.
This supersedes earlier same-day installers and includes all prior requested
changes. Version/updater remain 1.1.28; no Pages deployment/automatic install.
Visual and physical acceptance remain pending. Install, configure opening stock,
save Settings, wait for stock totals to appear, then test + and Giveaways.

### Giveaways implementation on 6 November

New desktop-only `giveaways.html` page, linked from every facilitator page, titled
Giveaways. Displays today's raw registration snapshots (same original values as
Google Sheets) without a visible Registration ID column, plus an auto-saving
giveaway dropdown. One row per registration, not per vehicle/ticket; includes
earlier runs today and is unaffected by queue resets/reissues/model additions.
Search by client name; compact shared-table styling. New registrations and all
existing ones default to Unclaimed. Settings has a one-item-per-line giveaway
list like dealerships; trims/deduplicates, reserves Unclaimed, max 200 x 160
characters. Removed items remain visible on previously claimed rows.

Claims persist in cloud registrations with an updated timestamp; this does not
modify raw Sheet job payloads or Google Sheets columns. Writes are location-
scoped, licensed in the desktop, protected by the existing writer-token bridge,
and compare the prior item to reject stale-window overwrites. Failed/uncertain
saves instruct the operator to refresh before dispensing. This page requires
a connection for loading/saving; it retains visible rows during a failed refresh
but is not an offline giveaway outbox. Polling preserves focused dropdowns.

Applied additive migration `202611060001_giveaways.sql` via Supabase CLI 3.0.0
`db query --remote=pnyptdyfkftrcgjlaqnr --file ... --yes`; deployed only the
private test-drive-operations function using `--use-api --no-verify-jwt`.
Explicit anon/authenticated RPC revokes are necessary despite revoking PUBLIC:
hosted default grants were found and corrected, then verified false. The
PostgreSQL test now simulates these default grants to catch regressions.
No live selections were written: 12 unique rows today, all Unclaimed; live totals
remained 73 registrations, 103 tickets and 73 Sheet jobs. Read-only smoke helper
is ignored at `.dev-db/verify-giveaways-live.cjs`; never publish private outputs.

Checks: 316 Node passing / 3 skipped, 22 isolated PostgreSQL integration checks,
16 Python speech tests. Built manual installer successfully:
`app/dist-test-drive-20261106-giveaways/tdqsys-test-drive-1.1.28.exe`.
Includes all preceding audio, Sheets and formatting changes. Version/updater
remain 1.1.28; no Pages deployment or automatic installation. Visual/manual
acceptance pending. Configure giveaway options in Settings after installing.

### Whole-sentence production implementation on 6 November

User now explicitly approved implementing whole-sentence clips. This supersedes
the segmented production strategy described in older sections below. Kokoro is
unchanged; each complete Announcement / Call Back text is synthesized in one
request, with no prefix/number/model stitching or inserted joins. Saved wording,
voice and pronunciation hints are preserved; no audition IPA is hard-coded.

New persistent cache: `%APPDATA%/TDQSYS/audio_cache/sentences-v1`. Keys include
full spoken text, voice, speed and sentence-format version. Old segment caches
remain untouched for rollback. RAM holds at most 32 sentence clips; existing
disk/memory clips bypass the generation lock, so warmup does not block cached
playback. Missing audio still requires rendering; do not promise instant cold
playback. Preview and live use identical whole-sentence cache bytes. Native FIFO
playback remains independent of pages and the cloud.

Background preparation: numbers 01–50, two actions per model, round-robin across
models. At displayed number 25, prepare through 100; at 75, through 150, etc.
Each model advances independently; jumps start near its current displayed ticket.
Warmup yields between clips to live jobs/previews and abandons obsolete wording
or voice sweeps between renders. Settings saves are detected by the worker;
changing voice requires new audio. Settings and facilitator pages show progress.
Initial setup can take substantial time for many vehicles: wait for the current
batch readiness message before evaluating cached response time.

Tests so far: 310 Node passing / 3 skipped; 16 Python speech tests passing.
Packaged service verifier passed whole-sentence mode, two initial clips,
preview/live byte equality, unsaved Settings preservation, local authorization,
cache reuse and two FIFO jobs, with physical playback suppressed. Cached request
median was 2.07 ms on the final rebuilt executable, NOT audible latency.
Final installer built successfully:
`app/dist-test-drive-20261106-sentences/tdqsys-test-drive-1.1.28.exe`.
Packaged speech executable and changed UI match final source/staging byte for
byte. Physical listening remains pending; no audible acceptance is claimed.
No auto-update publication, version bump, live-data reset or installation.

### Sales Executive table formatting on 6 November

Sales Executives now shares the compact table styles used by Master Table and
Print Queue: 12 px headers/cells, 7 px by 6 px cell padding, 11 px action buttons
with 4 px padding and 2 px margins. Shared CSS rules prevent formatting drift.
No SE actions, columns, sorting, data or registration behavior changed. New
formatting regression test; full Node suite: 309 passing, 3 skipped, 0 failures.
Visual acceptance pending. Built latest manual installer (successful exit;
packaged CSS verified byte-identical to source):
`app/dist-test-drive-20261106-tables/tdqsys-test-drive-1.1.28.exe`, including the
Google Sheets relocation below. Version/updater remain unchanged.

### Google Sheets setup relocation on 6 November

Moved the Sheet URL, service-account email/copy control and connection/tab
preparation controls from Settings to Event Setup / QR Codes. Added a dedicated
Save Google Sheets URL button, hydrating the existing saved destination. The
local engine accepts a licensed URL-only patch without replacing queue numbers,
identity, speech settings or other configuration. The existing background worker
continues configuring/syncing and silently retrying. General Settings preserves
the saved destination. Node suite: 308 passing, 3 skipped, 0 failures, including
three new relocation/persistence/renderer regressions. Visual acceptance pending.
Built manual installer:
`app/dist-test-drive-20261106-sheets/tdqsys-test-drive-1.1.28.exe` (version 1.1.28).
Build exited successfully; packaged engine and changed pages match source byte
for byte. Initial output folder hit Windows file-access errors; a fresh output
folder succeeded. Existing 3 November installer was not overwritten.
No public deployment, updater change or installed-app replacement performed.

Today's explicitly requested simulation reached 10 SEs and 12 clients before
the API returned "Registration could not be completed. Please see the
facilitator." Preserve the private state in
`outputs/tdqsys-simulation-20261106/simulation-data.json`; no blind resubmission,
reset or automatic restart was performed after this error.

### Explicit phoneme audition on 6 November

Listening feedback: EX sounded like "LI EKS". Added an EX-only comparison at
`outputs/tdqsys-phoneme-audition-20261106/ex-prefix/index.html`: original,
unstressed IPA, no vowel-length marks, and separately rendered E/X letters.
Twelve WAVs provide each prefix alone plus Ongoing/Call Back context. Verified
original contexts byte-identical and all non-prefix clips unchanged. Same
voice/speed/10 ms joins; no production change. User listening selection pending;
the supplied IPA contains no L, but the audible cause is not yet established.

User asked to force the queue-prefix and vehicle-name segments to phonemes.
Created an isolated Kokoro trial, not a production implementation, under
`outputs/tdqsys-phoneme-audition-20261106/index.html`. Six A/B pairs cover
Ongoing/Call Back for GX01, EX01 and CRY01, with 24 total WAVs including
isolated components. Saved am_liam voice, speed 1.0, actual planner/stitcher,
0.015/5 ms silence trim and 10 ms joins. Phrase/number recordings are shared.

Verified installed kokoro-onnx 0.5.0 already phonemizes ALL ordinary text.
Simply toggling explicit mode with identical phonemes would not change output.
Trial overrides use explicit proposed IPA with `is_phonemes=True` for only
the two components, spelling letter prefixes and proposing "Jee lee" for
Geely. The report exposes both automatic and proposed phonemes for review;
these are not claimed to be officially approved brand pronunciations.
Numbers and wording remain normal text; saved Settings/cache/installer/app
source are untouched. This may affect pronunciation, not guarantee sentence
fluency. No listening acceptance is claimed. Helper and cache are ignored
under `.dev-db/`; outputs remain private/untracked. Nine Python speech tests
and the helper's two-component-only routing self-test passed.

### Client presentation package and fresh simulation on 5 November

At the user's explicit request, ran a new API simulation (not an automatic
resume): 10 fictional SEs, 20 clients and 27 tickets. Random 5-60 second gaps.
Private state: `outputs/tdqsys-simulation-20261105/`. Verified all 20 raw rows
once each in `TDQSYS Reg 11/05/2026`, without missing/duplicate delivery.
No resets, physical printing or queue status calls were performed; preserve
these records for user testing and do not rerun automatically.

Client-facing package: `outputs/TDQSYS Client Presentation 2026-11-05/`, with
20 numbered screenshots, a three-page `TDQSYS Client Walkthrough.docx`, a
clickable `Screenshot Index.html` and Read Me. A ZIP beside the folder is the
sharing copy. No simulation JSON, keys or internal QA artifacts go in the ZIP.

Both Windows screenshot APIs timed out (`FrameArrived` / `window capture`).
The user explicitly approved a separate Electron capture helper. It loads the
real locally served desktop pages and public registration forms, uses the
existing preload contract plus read-only cloud snapshots, and blocks mutations.
Captures show the populated real demo records, not a fabricated UI. Sensitive
Settings fields are blurred only in the helper, not changed in the installation.
The TV start overlay was dismissed in the helper; numbers remain zero because
no client was marked Ongoing. Brand 2 is disabled in this actual configuration.

Tools are ignored/private: `.dev-db/presentation-capture.cjs`, the isolated
document env/renderer, builder and QA folder. The standard document dependency
loader was unavailable. Native Word background PDF export hung; only that
task's verified Word/PowerShell processes were stopped. Alternative DOCX
preview produced three Letter-size pages without overflow; all page images
were visually reviewed after removing inherited theme colors/title borders.
Do not claim native Word/PDF render acceptance. Source app, installed build,
version 1.1.28, updater, saved settings and audio were not modified.

### Pocket TTS audition (5 November) — isolated experiment, not integrated

Follow-up requested by user: compare segmented Pocket. Generated eight paired
auditions in `outputs/tdqsys-voice-audition-20261105/segmented.html`: six Marius
texts plus Alba's first Ongoing/Call Back pair. Reuses unchanged production
`speech_segments.ticket_plan` and `SegmentCache.compose`; Pocket independently
renders each part, silence trim matches 0.015/5 ms, joins remain 10 ms. Separate
cache, no crossfade/stretch/context conditioning. Whole-sentence clips retained.
18 unique parts generated; cached assembly 0.390-0.593 ms (not speaker timing).
All eight PCM WAVs passed frame/length checks; trim self-tests and nine existing
Python speech tests passed. Listening pending; no production speech changes.

User approved trying Pocket TTS after discussing alternatives. Installed only
the official Windows standalone binary in `.dev-db/pocket-tts-audition/`.
GitHub release v4.0.1 carries a Windows ZIP named 3.3.0; its SHA256 was verified
against GitHub asset metadata. No global Python dependencies were installed.
Models/cache are isolated under that folder via process-local HF_HOME.

- Live test server: http://127.0.0.1:8012/ (loopback only). Default preset is
  Marius (CC0 Selfie reference). No custom cloning/account login or acceptance
  of gated model terms. Public preset model metadata lists CC BY 4.0.
- Upstream built-in shortcuts pin an old revision missing english_2026-10
  embeddings. The working setup uses public preset paths explicitly pinned to
  `a7056f505a4a8ca72d8b5fb1440071d6f1a35739`; details are in the audition README.
  Leave live tester reference fields blank for default Marius, or use README's
  explicit Alba preset URL. Custom reference uploads require gated clone access
  and do NOT work with the public no-cloning model.
- Audition page: `outputs/tdqsys-voice-audition-20261105/index.html`.
  Six identical full sentences (Ongoing/Call Back, tickets 01/12/50 across two
  configured models), 14 WAVs: six Pocket Marius, six Kokoro am_liam and two
  Pocket Alba. Text comes from saved wording/pronunciations; voice identities
  differ across engines. No automatic audio playback.
- Pocket Marius: 1.0684-1.3682 s per full clip. Kokoro: 5.7915-7.1231 s, mean
  6.4200 s. Alba: 3.6647 s first request (includes voice preparation), then
  1.1082 s. Not controlled load-isolation tests and NOT live playback latency.
  The six Kokoro clips were rendered by a disposable, playback/warmup-disabled
  process on 8013; that process was stopped afterward.
- `results.json` records exact texts, times and durations. All 14 WAVs validated
  nonempty, correct RIFF lengths. Launchers parse; stop/restart and health check
  passed. Opened comparison and live tester in browser; visual/audio quality
  have NOT been independently verified. User must listen/judge fluency, number
  accuracy, leading zeros, repeats/omissions and model pronunciation.
- Double-click `Start-Pocket-TTS.cmd` / `Stop-Pocket-TTS.cmd` in that output
  folder to restart/stop only this server. README includes credits/conditions.
  Keep all `outputs/` private/untracked. Scripts/report generation live in the
  ignored audition folder; production TDQSYS source, settings, installer, cache,
  registration records and updater were not changed.

Next: user auditions the files. Do not replace Kokoro or adopt full-sentence
production caching based on speed alone. Background load tests, packaging,
licence/attribution audit and user listening acceptance remain pending.

### Latest user feedback and discussion (3 November)

**The user tested the new build and explicitly confirmed: "the announcement
is now instant!"** Preserve this result. Their next priority is fluent,
whole-sentence intonation without audible segment boundaries, not more changes
to queue/cloud latency. Fluency has NOT been accepted yet.

- Local-first operations were pushed as `f13c0d3`; the TV day-rollover correction
  was pushed as `3d3ff19`. The latest manual installer includes both. Version
  and updater remain 1.1.28; no stable release replacement or notification.
- At the user's request a new registration simulation completed on 3 November:
  10 SEs, 20 clients, 27 tickets. Requests used public APIs with random 5-60 second
  intervals. Initially the dealership list was empty; the user configured it,
  then all submissions succeeded. Do not rerun automatically on resume.
- Current configured dealerships at simulation time: Alabang, Fairview,
  Las Piñas, Makati, Manila, North EDSA and Quezon Avenue. Seven Geely models.
  All 20 registrations were verified once each in `TDQSYS Reg 11/03/2026`,
  with no missing or duplicate deliveries. Keep these records for user testing.
  New run data is local/private in `outputs/tdqsys-simulation-20261103/`;
  yesterday's spreadsheets/records remain untouched. Do not publish codes/data.

**Whole-sentence caching is a proposal, NOT implemented or approved for coding
yet.** The user asked feasibility questions; do not treat them as permission
to replace the existing speech/cache architecture. Current live speech still
uses independently rendered segments with 10 ms joins. Kokoro's current API
does not supply shared sentence context across independently rendered clips.
Reducing join gaps alone cannot guarantee sentence-level intonation.

Discussed proposal: two full recordings per ticket number per vehicle model,
one Ongoing and one Call Back, cached locally for immediate playback. Retain
old voice/text caches so switching back can reuse them; changed voice requires
new required recordings, changed wording/pronunciation invalidates affected
sentences only. Generate nearest upcoming tickets first rather than bulk
rendering all 50 per model before the app is usable. Clearly indicate readiness.

Measured six uncached full-sentence HTTP synthesis requests on this laptop,
using the saved `am_liam` voice/wording, first configured model and tickets
41-43 (both kinds). No audio playback or Settings changes. Results:

- Ongoing: 7.395, 7.549, 7.631 seconds; Call Back: 6.576, 6.675, 6.702 seconds.
- Mean 7.088 s/clip. This is elapsed generation/request time on the running
  service, not a controlled load-isolation benchmark, and not cached playback.
- About 16 complete clips (8 ticket pairs) in two minutes.
- 50 numbers x 7 models x 2 kinds = 700 clips, roughly 83 minutes.
  12 models = 1,200 clips, roughly 142 minutes, extrapolated rather than measured.
- Benchmark script/report are local ignored files:
  `.dev-db/benchmark-full-sentences.cjs`, `.dev-db/full-sentence-benchmark.json`.

User assumes each drive lasts 20-30 minutes. At 12 simultaneously operating
vehicles, 24 new clips per cycle take approximately 170 seconds to prepare,
suggesting ample steady-state headroom. Two initial ticket pairs per model
would take approximately six minutes for 12 models. These are estimates, not
a guarantee under load; clients adding models, jumps/reissues and cold starts
need explicit prioritization/fallback handling. Repeated callbacks reuse clips.

Last discussion: generation consumes CPU/memory and might affect background
tasks. Proposed safeguards are one synthesis worker, low-priority preparation,
yielding between clips and prioritizing imminent tickets; live cached playback,
queue actions, registration sync and Sheets retries must stay responsive.
**These priority changes are not implemented, and concurrent-load behavior has
not been measured.** An in-progress render can take about seven seconds before
yielding; playback must not wait for the model/cache synthesis lock. Do not
promise an existing clip is nonblocking until that concurrency is verified.

Next on resume: finish the design/obtain approval before implementation, then
compare full-sentence fluency and measure cached playback plus simultaneous
background generation under real registration/sync load. Do not regress instant
announcements, bump versions, reset data or restart the simulation on your own.

### Earlier implementation notes

Day-rollover fix, 3 November: the TV projection now resets to zero at local
midnight even offline, rather than leaving yesterday's numbers while tables
empty. Its boundary marker/projection survive restart; new-run model displays
are reconciled without deleting history or pending operations. Node suite now
passes 305 tests (three optional skips). Rebuilt manual installer remains 1.1.28.

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
Verification: 305 Node tests passed (three optional skips), 21 database checks,
nine speech checks, and live disposable-location restart/lost-ack replay passed.
The rebuilt manual installer is 232673669 bytes. Packaged main/preload, local
journal module and changed UI files match source. Main and preview Pages were
deployed; public registration/display routes work and desktop routes stay blocked.

The earlier speech-consistency task made Settings announcement and Call Back previews
use the same cached segments and stitching as live Ongoing/Call Back. Added
joins were reduced from 50 ms to 10 ms, with synthesis speed still 1.0.
Matching Settings/model/ticket inputs produced byte-identical preview/live WAVs
in the packaged engine. Unsaved preview edits do not change saved Settings or
enqueue speaker playback. Background preparation yields to preview requests.

Earlier listening checklist (instant response now confirmed; fluency pending):
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
- Latest implementation commit, pushed to origin/main: `3d3ff19`.
- Manual installer: `app/dist-test-drive/tdqsys-test-drive-1.1.28.exe`,
  232673669 bytes. Build completed; packaged source/resources checked.
- Version remains **1.1.28**. Never change `public/version.json`, raise the version,
  replace stable release assets, or trigger update notifications before acceptance.
- Stable checkpoint: `90d0ee7`, tag `checkpoint-v1.1.28-pre-test-drive`, branch
  `backup/v1.1.28-pre-test-drive`.
- Stable installer: `app/dist-installer/tdqsys-setup-1.1.28.exe`; SHA256
  `06E2E4D22F52D81F1181E480DC497BC914A99F2C08CA7A849ED17102F5A2A14C`.
- Preview and main Pages deployments completed. Staff controls/Settings stay
  desktop-only; public pages are registration forms and queue displays.
- Latest checks: 305 Node tests passed, 3 optional skips; prior unchanged suites
  passed 9 Python speech checks and 21 database integration checks. Packaged
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
