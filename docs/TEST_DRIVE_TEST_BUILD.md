# Test-drive manual-test build

## 12 November media ducking OTA publication

User authorized OTA publication of the media-volume-only change while live.
Versions: v1.1.29 and v2.0.5. No running app was stopped or updated by the agent.
Updates remain operator-initiated; installation closes/restarts the chosen app.

V1 release uses the deployed stable v1.1.28 main.js, preload.js, engine and
TTS binary unchanged; only reviewed media display assets and version metadata
changed. The original stable installer remains retained. Stable core came from
app/dist-installer/win-unpacked, not the older v1 worktree main.js.
V1 website is staged from exact production commit 2544c0ee7e83e2fca5c34430a55b0ae163a02ce8,
deployment 3681ed22, production branch main. All 52 other site/backend files
were verified unchanged; only client.html, display_with_ads.html, version.json
and the new media-ducking.js differ. Do not deploy the old v1 checkout wholesale.
V2 retains its separate product ID, profile, endpoints, installer and feed.
No database, registration, printing, queue, wording or speech timing changes.

V1 source: 29b5b45aa20a61c2f91c972af3408a753264e8e4; v2 source:
2f79fca8c0d1ea8b1627e731b7960969aa6376ac.
V1 checks before publication: 212 passing / 10 optional network skips.
V2 checks: 413 passing / 3 skipped. Physical listening is still pending.

V1 installer: app/dist-test-drive-v1-1.1.29-20261112/tdqsys-setup-1.1.29.exe
225640730 bytes; SHA256:
ce07c549629e35cadec8fa1cabbd9c30941fb56a9ebae1327a7e7ce24da40b68
V1 portable: 225360412 bytes; SHA256:
505be42564e2b9d60a9fd182c1e7c67575609db21ea901b216fc105a9ff32b11
V2 installer: app/dist-v2-2.0.5-20261112/tdqsys-v2-setup-2.0.5.exe
232871599 bytes; SHA256:
79ad4c8aa7cf37774beb639588b0b4311a92be7b37bca8effbc0bafa5d5f1793
V2 portable is built locally only, not required by its OTA feed.
Do not overwrite any previously published same-version artifact.

OTA publication verified: both releases are public; uploaded digests and byte
counts match local artifacts. All three public download HEAD checks are HTTP 200.
Live v1 feed is 1.1.29 (deployment 896f2ec6); live v2 feed is 2.0.5, enabled=true
(deployment b03bddfa). Display/helper assets verified on both production hosts.
Protected v1 af.js and style.css still match the prior production baseline.
GitHub stable Latest is v1.1.29; v2 remains a separate prerelease/OTA channel.
Final isolated checks: v1 214 pass / 8 skips; v2 413 pass / 3 skips.
No live application was installed or restarted. Physical listening acceptance
remains pending. Operators should install only during a suitable pause.


## 12 November media audio ducking - local test builds

Media ad volume drops to 10% of its pre-announcement level while announcement
or Call Back speech plays, then restores that exact level. Existing mute and
Windows master-volume settings are untouched. Queued speech stays ducked;
duplicate/reentrant completion and playback errors cannot restore it early.

V1 uses the display/viewer Audio lifecycle. V2 also signals native desktop
speech before enqueue, then tracks its existing private FIFO status locally
until two idle checks. Service failures release ducking instead of leaving
media permanently quiet. Reloaded local displays resynchronize active state;
page navigation does not stop native playback. No TTS binary changes.

V1 tests: 210 pass / 12 skipped. V2: 413 pass / 3 skipped.
Targeted tests cover queue overlap, failures, muted/zero volume, prior-volume
restoration, stale initial activity, native FIFO and Ongoing/Call Back paths.
Packaged source checked; physical listening acceptance remains pending.
No live announcements, registrations, resets or installations were triggered.

Local manual test installers (NOT published, no version/OTA changes):
V1: app/dist-test-drive-v1-ducking-20261112/tdqsys-v1-ducking-setup-1.1.28.exe
225640845 bytes; SHA256:
2fbbeb4637fbb2a0ab00d94e2d62aeb729cbb742083ff2ce273466e5359bbcb2
V2: app/dist-test-drive-v2-ducking-20261112/tdqsys-v2-setup-2.0.4.exe
232871593 bytes; SHA256:
1f63d8969e01db1bb6fb6f58ced906a2d600b0c36927722b31f48825b062da77
V1 test package retains the existing stable app.asar, speech executable and
engine byte-for-byte; only reviewed display/viewer/helper assets changed.
It is not a rebuild of the older v1 worktree main.js. Stable original build
and published assets are retained. A future publish needs separate bumped
v1/v2 releases; do not overwrite current versioned GitHub assets.



## 12 November v2.0.4 removes printed-waiver agreement

Removed the "I agree to sign a printed copy of this waiver" checkbox.
The registration browser script no longer reads/submits/requires that field.
Shared validation no longer requires it, and the Pages registration endpoint
no longer uses it to trigger consent checks. The built-in simulator submits
the updated payload. Legacy requests containing the extra field remain
compatible, but cannot bypass normal waiver, Terms or Data Privacy consent.
Populated waiver acceptance, Terms acceptance, required privacy consent and
blank-statement hiding/navigation remain unchanged.

V2 desktop package/lockfile now 2.0.4. Source:
256ac7aedd56951903f90702df11ba198f30711b.
405 Node tests pass / 3 skipped; 46 isolated PostgreSQL checks pass.
Packaged version 2.0.4 and HTML/JS/simulator verified against source.
No printed-waiver field remains in production public/shared/functions sources.
No database migration, live registration, reset or data correction performed.
Native UI/operator acceptance is not claimed.

Artifacts: app/dist-v2-2.0.4-20261112/ (also copied to local TDQSYS v2)
Installer: tdqsys-v2-setup-2.0.4.exe, 232870126 bytes, SHA256:
e39b58d1515cb735d4fb4d3b11661b1b612f9ca266d91e84e9d11e265b640e0d
Portable: tdqsys-v2-portable-2.0.4.exe, 232589358 bytes, SHA256:
b670530527b74ead6aeba8b1a53d4e73a69f63ff46ce6cb9dfa76d2a4b80c334
Download:
https://github.com/epiparilla/tdqsys/releases/download/v2.0.4/tdqsys-v2-setup-2.0.4.exe
Both GitHub asset sizes/SHA256 digests verified. Public installer HTTP 200.
Completed interrupted Cloudflare deployment dff7831e: live feed now enabled
at 2.0.4; public HTML/JS verified without the printed-waiver field.
Missing update notification was traced to the live feed remaining at 2.0.3
after interruption, not a new updater-code defect. Resumed deployment fixed it.
Live validator offers 2.0.4 to 2.0.3, not to 2.0.4 itself. Use Settings >
Check for Updates immediately; automatic background polling is every 30 minutes.
V2 OTA remains enabled. Installed v2.0.2+ can check from Settings.
V1 manifest, assets and stable Latest 1.1.28 remain unchanged.
For manual install, fully Quit v2 via the tray first. Do not uninstall/reset.



## 11 November v2.0.2 to v2.0.3 OTA acceptance test ready

Confirmed the running installed application is TDQSYS v2 version 2.0.2.0 at
C:/Program Files/tdqsys-v2/tdqsys-v2.exe with the expected NSIS uninstaller.
User chose to click Update personally; no update/quit/install was triggered
by the agent. Pre-test data.json and local queue journal were copied privately
to ignored .dev-db/ota-203-preflight-20261111. Never publish these files.

V2.0.3 is a version-only acceptance release. Packaged main.js, product.js and
preload.js are byte-identical to v2.0.2; no business behavior changes.
Source: 60fbf474e11e5a70d41854887dd980a2cf4d1a6a.
Artifacts in app/dist-v2-2.0.3-20261111/ (also copied to local TDQSYS v2):
Installer 232870271 bytes, SHA256:
719f8ef195ef02b20a3465bbb103d70d559628ded5fbb1264813315d45c1b5ee
Portable 232589501 bytes, SHA256:
703450c028fbbb61290959ba3837f29ff4aa3b582d76b648e359bb803ffb5dce
GitHub v2.0.3 published; uploaded checksums match and installer HEAD is HTTP 200.
Cloudflare v2 deployment cd40e0ca completed. Live enabled feed offers 2.0.3
to 2.0.2, with exact installer URL, bytes and hash.
405 Node tests pass / 3 skipped. No live test records changed.
V1 and previous v2 assets are retained.

Operator action: Settings > Check for Updates > Update from installed 2.0.2.
Do not manually install this target when testing OTA. Allow the download,
approve Windows elevation if requested, and verify restart reports 2.0.3.
Helper log: %TEMP%/TDQSYS-v2-update-2.0.3.log.
Live download/install/restart acceptance is still pending; readiness and
feed checks must not be reported as a successful physical OTA test.



## 11 November v2.0.2 updater detection fix

Observed installed v2.0.0 at C:/Program Files/tdqsys-v2/tdqsys-v2.exe.
Its real NSIS uninstaller is Uninstall tdqsys-v2.exe; the old detector only
accepted Uninstall TDQSYS v2.exe. This incorrectly selected portable mode,
opened the browser download and returned "Update failed: portable".
NSIS uses executableName as PRODUCT_FILENAME, confirming the naming mismatch.

findOwnUninstaller now checks the exact executable-name uninstaller first,
then the v2 display-name variant for compatibility. Both are restricted to
the executable's own directory; v1/other folders remain excluded.
The portable fallback no longer opens a browser/save dialog; it explains
that setup installation is required. Installed mode retains the existing
background download, byte/SHA256 validation, silent install and relaunch path.
Regression tests exercise the IPC branch with mocked installation only.

V2.0.0 and v2.0.1 cannot bootstrap this correction through their broken gate.
One manual setup installation of v2.0.2 is required: fully Quit from the tray,
run setup over the existing installation, and retain all data. Do not uninstall.
Windows may request administrator permission. No running app was stopped,
installed or changed during development; actual OTA install/relaunch remains
operator acceptance, not a verified live result.

New artifacts: app/dist-v2-2.0.2-20261111/
Installer: tdqsys-v2-setup-2.0.2.exe, 232870253 bytes, SHA256:
89a69c8b97696f4948656c96db3720385a86cdb265a0c951e4af925443c58c25
Portable: tdqsys-v2-portable-2.0.2.exe, 232589501 bytes, SHA256:
065ab3eb09f14ab553fbfdd784735d2b3c9d980d5f921f5bebba283257412df1
Source: 8cb903e67be9337d15ad8f0a68cddb049d25284b.
405 Node checks pass / 3 skipped. Packaged main/product/preload match source;
packaged version 2.0.2 and actual installed-directory detection verified.
Download: https://github.com/epiparilla/tdqsys/releases/download/v2.0.2/tdqsys-v2-setup-2.0.2.exe
GitHub checksums and byte counts verified; public installer is HTTP 200.
V2 Pages cd48b4e8 deployed. Live feed targets 2.0.2 with OTA enabled;
validator offers it to older v2, not to 2.0.2 itself. V1 Latest remains 1.1.28.
V1, live data and earlier v2.0.1 release assets remain unchanged.
Local TDQSYS v2 source and release binaries synchronized.



## 11 November v2 OTA enabled

User authorized OTA activation after publication of v2.0.1.
https://tdqsys-v2.pages.dev/version.json now has enabled=true and targets
the existing v2.0.1 installer (232870105 bytes, SHA256
5a0880a7459a1754361a2b1e4a1b45242f648f35df8b2d874f45e404b482b962).
No binary rebuild or version change was needed.
Cloudflare v2 deployment: d944bc3e. Live feed matches local metadata.
GitHub asset checksum matched; public installer HEAD is HTTP 200 with exact size.
Live validator check: v2.0.0 is offered 2.0.1; v2.0.1 is not offered itself.
Legacy v1 feed remains byte-content equivalent and unchanged at 1.1.28.
402 Node tests pass / 3 skipped, including activation and disabled-feed gating.
No update was installed on the operator laptop and no live data was changed.

Operator: open Settings > Check for Updates in v2.0.0. The background check
runs about 15 seconds after startup and every 30 minutes thereafter.
Actual download/install/relaunch acceptance remains for the operator.
This entry supersedes earlier notes saying v2 OTA was disabled.



## 11 November v2.0.1 release

V2 desktop version is now 2.0.1 (app package and lockfile agree).
Installer: app/dist-v2-2.0.1-20261111/tdqsys-v2-setup-2.0.1.exe
Portable: app/dist-v2-2.0.1-20261111/tdqsys-v2-portable-2.0.1.exe
GitHub tag: v2.0.1; source e7a578f67c92a4e82bca789b52820f86cedf012a.
Installer download:
https://github.com/epiparilla/tdqsys/releases/download/v2.0.1/tdqsys-v2-setup-2.0.1.exe
Installer: 232870105 bytes; SHA256:
5a0880a7459a1754361a2b1e4a1b45242f648f35df8b2d874f45e404b482b962
Portable: 226207686 bytes; SHA256:
8b22dfe36aaa03c87c9ab55beb22c1cf24ebf8a2dadfb3d78a1c8fd74d4363ec

Includes orange Ongoing status and durable Ongoing undo/redo (ae66d22).
402 Node tests pass / 3 skipped; 46 PostgreSQL integration checks pass.
Packaged version is 2.0.1, executable version 2.0.1.0; main, product,
preload, queue engine and UI match source. Native/operator acceptance pending.
V2 Pages deployment a626317d completed with version 2.0.1 and enabled=false.
Facilitator JS remains desktop-only (404 on Pages by design).
V1 manifest/assets and stable Latest v1.1.28 remain unchanged.
OTA stays disabled; manually Quit via the tray and install this build.
Matching binaries and tracked sources are also kept in the local TDQSYS v2 folder.
GitHub installer/portable checksums and byte counts match local builds.
Both public downloads verified HTTP 200 and exact Content-Length.



## 11 November Queue Board Ongoing undo/redo

Ongoing status text is now orange. Queue Board has Undo Ongoing / Redo Ongoing
buttons plus Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z (text fields keep native undo).
The last 30 Ongoing selections are retained locally across page changes and
app restarts. Undo restores the affected clients' statuses and that model's
display number, including zero; redo reapplies the selection. Ticket numbers,
registrations, counters and other vehicle models are unchanged.
No announcement is replayed; previously heard audio cannot be undone.

Done / No Show / Cancel status actions clear this Ongoing-only history.
A new Ongoing selection clears redo. Run/day/model changes and conflicting
current statuses/display numbers prevent unsafe restoration. Licence and busy
guards apply. Restores are durably journaled before display projection and
sync asynchronously with idempotent, audited, location/run-scoped compensation.
Migration 202611110001_queue_undo.sql applied and verified live; anon and
authenticated cannot execute the sync RPC. Ordinary queue sync is preserved.
No live registrations, statuses or queue numbers were changed during testing.

402 Node tests pass / 3 skipped; 46 isolated PostgreSQL checks pass.
Packaged main, local engine and UI match source. Native visual/operator
acceptance remains pending (no GUI test claimed).
New local manual installer, still v2.0.0:
app/dist-test-drive-v2-undo-20261111/tdqsys-v2-setup-2.0.0.exe
Size: 232870076 bytes; SHA256:
693f2c3f353ce2bcb71d6ec9e1b3632c0f05c6dda4be0d55181d7ba0c6edcede
The 10 November public download is unchanged and does NOT include this change.
No version bump, OTA activation, v1 change or public Pages deployment.



## 10 November manual installer published

Download: https://github.com/epiparilla/tdqsys/releases/download/v2.0.0-test-20261110/tdqsys-v2-setup-2.0.0.exe

GitHub prerelease: v2.0.0-test-20261110. App version remains 2.0.0.
Includes explicit Done / No Show confirmation and all earlier changes.
Source commit: 1c1a2f21d2a369bc8cb886b9fe55b5dc4a0ff14f.
Installer: 232868895 bytes. SHA256:
7450487415df1269be1a34e916a619f09afe232ef7413c6f4636831f37e42a01

Verified uploaded asset checksum, public download HTTP 200 and exact byte size.
Fresh Node suite: 397 passing, 3 skipped, 0 failures.
V2 Pages deployed from the same source (4910546d); public v2 manifest
remains enabled=false. V1 latest remains v1.1.28; neither updater manifest changed.
Manual installation only: fully Quit TDQSYS v2 from the tray before installing.
No live records changed. Physical acceptance remains with the operator.




## 9 November explicit Done and No Show confirmation

Queue Board Done and No Show buttons now ask for confirmation before calling
the existing status action. The prompt identifies the complete prefixed ticket,
client and vehicle, and explains that the entry leaves the active queue list
without changing the TV number. Cancel performs no mutation or local write.
This applies to every vehicle column, including repeated horizontal-loop
columns and the second-brand board.

Ongoing and Call Back remain immediate and do not prompt. The automatic change
of the previous ongoing client to Done is unchanged; confirmation applies only
when the facilitator explicitly presses Done or No Show.
397 Node checks pass / 3 skipped, including cancel/confirm behavior, prompt
details and unchanged Ongoing/Call Back actions. Packaged source verified;
physical/native-dialog visual acceptance remains pending.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-statusconfirm-20261109/tdqsys-v2-setup-2.0.0.exe
No database or public viewer deployment required. All earlier features and
the client presentation revision 3 are retained. Local guides synchronized;
no live statuses changed. V1, version manifests and OTA unchanged.


## 9 November client presentation revision 3

Updated the client walkthrough and regenerated 35 screenshots from the current
v2 UI using isolated fictional fixtures. The ten-page Word document now covers
opening TDQSYS v2, reopening via the tray, Restart versus Reset to Zero, and
full shutdown via Quit TDQSYS. It also reflects current privacy/waiver options,
printed-waiver agreement, Master Table status colors, display font/logo
settings, audited giveaway/opening corrections, short simulation pacing and
complete vehicle-list import.

Deliverables:
outputs/TDQSYS Client Presentation 2026-11-09/TDQSYS v2 Client Walkthrough.docx
outputs/TDQSYS v2 Client Presentation 2026-11-09.zip
The full archive contains the walkthrough, HTML screenshot gallery, Read Me
and 35 PNG screenshots (38 files). Earlier presentation versions are retained.
All ten pages visually inspected using the isolated OOXML page preview;
native Word/LibreOffice rendering remains unavailable. Source styles/package
parts and the prior walkthrough were preserved. No live simulation, client
registration, printer job, giveaway change or installed setting was written.
This is an artifact/documentation update only, not a new installer or deploy.
The latest manual installer remains the fastsimulation build listed below.


## 9 November built-in simulation shortened to a 2–3 minute target

The built-in simulator no longer uses the old 5–60 second observation delays.
It schedules registrations on a short five-second-per-record timeline and
subtracts time already spent in setup/API requests from subsequent waits.
The default 10-Agent / 20-client batch targets approximately 2–3 minutes;
smaller batches finish sooner. Slow networks/cloud delivery can exceed this
target: no real wall-clock/Google Sheets completion guarantee is claimed.

Removed the redundant public se-code prefill lookup during simulation.
Every registration submission still validates its Agent code server-side,
with all existing consent, version, location and atomic test-run safeguards.
Catch-up pacing enforces at least 4.2 seconds between client submissions to
avoid bursting the existing public code-validation limit after slow setup.

The existing Sheets worker is nudged after every simulated client and may
drain up to five sequential jobs per tick only while this location's simulation
is active. It stops on idle, unconfirmed delivery/failure or missing setup;
existing leases, idempotency and silent retry behavior are unchanged.
The normal outside-simulation policy remains one job per 15-second tick.
Sheet backlog, outages and delivery remain asynchronous; no registration is
deleted or falsely marked delivered. Printing remains manual.

396 Node checks pass / 3 skipped. Fake-clock full-batch checks verify 145s
with instant responses and about 147s with 1s per network request, safe
catch-up spacing, per-client Sheets nudges and bounded sequential catch-up.
Existing normal Sheets retry tests still pass. The unchanged database suite
previously passed 45 checks; this change requires no migration or API deploy.
Packaged helper, main process and Settings files verified. No live simulation
was started and no actual cloud timing or physical UI acceptance was measured.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-fastsimulation-20261109/tdqsys-v2-setup-2.0.0.exe
Local guides synchronized; v1, version manifests and OTA unchanged.
This timing supersedes the historical 5–60-second notes below.


## 9 November Settings registration simulator and vehicle-list import

Desktop Settings now has a separate Registration simulation — TEST DATA card.
Defaults: 10 Agents then 20 clients, with adjustable limits 1–10 / 1–20.
Submissions run sequentially through the public registration/code-validation
APIs at random 5–60 second intervals. Every third client selects two distinct
models when available (default full batch: 27 tickets). Names are marked TEST;
emails use example.invalid and contacts are synthetic eleven-digit strings.
Current saved settings/dealerships/models/consent versions are used. No Chrome
automation, direct registration-table insertion or automatic printing.

Start requires explicit TEST-data acknowledgement and confirmation. It syncs
saved configuration and opens a marked [SIMULATION] run, but only if the
current run has no tickets or giveaway stock/claim activity. Existing history
and daily Agent registrations are retained. A populated run must be closed
by the operator using the normal Reset to Zero / Open run flow first.
Start never clears an occupied run or deletes records. Simulation creates
real print jobs, registration rows and pending raw Google Sheets jobs; normal
background Sheets delivery/retries apply when a destination is configured.

The Electron main process owns the job, so navigation/page reload does not
stop it. Settings shows progress/logs/next submission time and a Stop button.
Stop interrupts pacing; an in-flight request may finish. Quit interrupts the
job, and it never auto-resumes after restart. A private status-only journal
contains counts/names/errors, not issued codes. Network/validation errors,
licence failure, location or saved registration-setting changes stop further
submissions. Uncertain submissions are not blindly repeated; verify tables.
The main process prevents duplicate jobs and restricts these controls to
local Settings. Licence checks apply before start and during the job.

Database wrappers lock/check the exact simulation run and TEST name before
calling the normal Agent/client allocation functions. If reset/daily rollover
switches the active run, delayed simulation submissions cannot allocate into
the official run. Browser roles cannot execute these RPCs. Ordinary registration
behavior is unchanged. Before official use: stop the test and open a new run;
optional advanced selected-run cleanup retains its existing private-backup
and confirmation safeguards. Google Sheets rows are never automatically
deleted. TEST Agent codes stay active until normal reset/expiry; no blanket
Agent reset or cleanup is performed automatically.

Brands & Cars now imports CSV or JSON files up to 100 KB, with validation,
a complete preview, and explicit Apply to editor before the normal Save flow.
Download CSV template and Export saved car list buttons are included.
CSV headers (case/space/underscore/hyphen tolerant):
Brand, Label, Shortname, Shortname pronunciation, Prefix, Prefix pronunciation
JSON accepts a flat array using brand/label/shortname/shortnamePronounce/prefix/
pronounce or {brands:[{name,models:[...]}]}. All six values must be present
and nonblank. Import limits: 2 brands, 12 total vehicles; duplicate labels or
prefixes within a brand, malformed CSV, markup/control characters and formula
cells are rejected. CSV export neutralizes spreadsheet-formula prefixes.
Matching saved brand names retain their colors and font/logo display settings;
new brands get default colors/display settings. File identity/cloud credentials,
waivers, giveaways, printing, queues and other Settings are not imported.
Applying only replaces the brand/car editor draft; normal Save confirmation,
queue handling and audio preparation still apply. Discard restores saved data.
No real configuration file was imported automatically.

393 Node checks pass / 3 skipped; 45 isolated PostgreSQL checks pass.
Tests cover full 10-Agent/20-client pacing, 27 tickets, cancellation, duplicate
start, licensing, interrupted jobs, settings changes, run/location guards,
normal allocation/print/Sheet jobs, private RPC permissions, preview-only
import, stale file reads, six-field round trips and malicious/invalid inputs.
Packaged main/helper/public files verified; real UI/live simulation acceptance
remains pending. No live simulation, printing, registration or import was run.
Applied 202611090002_registration_simulation.sql; deployed the private
test-drive-operations action and v2 public registration wrappers. No v1 deploy.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-testingtools-20261109/tdqsys-v2-setup-2.0.0.exe
Earlier installers and all fixes preserved. Local guides synchronized;
version manifests and OTA notification remain unchanged.


## 9 November audited giveaway and beginning-balance corrections

Normal issued-item checkboxes and saved opening balances remain locked.
Giveaways > Manage items now has "Correct recorded items / history".
Settings > Giveaway setup has "Correct balance / history" for initialized
items. These separate contingency dialogs require the entered operator name,
a reason, a verification checkbox and a before/after confirmation prompt.
Unchecking a mistaken issue restores one unit; checking a replacement deducts
one unit. Corrections are records-only: verify physical handover/stock first.
One of each item per registration/current run is still enforced.

Corrections are licensed desktop operations, authenticated by location writer
token. SQL locks serialize corrections with normal issues, replenishments and
run changes. The server compares expected current values and rejects stale
forms, cross-location targets, closed/earlier runs, duplicates, unavailable
replacements and negative remaining stock. A replacement batch succeeds in
full or changes nothing. Saved opening quantities update only through this
audited action; replenishments are retained. Existing ledger returns feed the
dashboard's Restored/net-given totals; remaining stock is recalculated.

The existing private audit_log retains original/new values, reason, operator,
timestamp, run and a retry receipt. Original claim ledger events remain;
opening corrections retain old/new quantities in audit history atomically
with the current balance update. Dialogs show the latest 200 matching audit
entries; full audit data stays in existing event backups. Explicit history
cleanup includes correction audit records and preserves its backup safeguards.
No raw form snapshots, Google Sheets data or configuration lists are changed.

Uncertain network results retain a run/target-bound request ID in local
storage and lock values for retry. Replaying cannot apply twice; a stale-data
conflict requires closing/refreshing before a new correction. Normal pending
issues/replenishments must be resolved before entering correction controls.
The recorded operator name is entered by staff, not a separate user login.

381 Node checks pass / 3 skipped; 43 isolated PostgreSQL checks pass.
Tests cover UI confirmation/cancellation, pending retry after reopening,
stale conflicts, location/run boundaries, audit/history, stock return and
replacement atomicity, opening reductions, retained replenishments, retries,
browser RPC denial, backups, dashboard totals and unchanged raw Sheet data.
Packaged files verified; physical visual acceptance remains pending.
Applied 202611090001_giveaway_corrections.sql and deployed only the private
test-drive-operations backend. No real client selections or balances corrected.
No Pages deployment is needed for these desktop-only staff controls.
Latest manual installer, still v2.0.0:
app/dist-test-drive-v2-giveawaycorrections-20261109/tdqsys-v2-setup-2.0.0.exe
All previous fixes retained. Local guides synchronized; v1 and OTA unchanged.


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
