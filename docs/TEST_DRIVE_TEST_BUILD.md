# Test-drive manual-test build

The released desktop and public update manifest remain at **1.1.28**. This
development build is installed manually; it must not replace the released
GitHub assets or `public/version.json` before acceptance.

## Restore point

- Source checkpoint: `90d0ee7`, tag `checkpoint-v1.1.28-pre-test-drive`.
- Backup branch: `backup/v1.1.28-pre-test-drive`.
- Released installer remains `app/dist-installer/tdqsys-setup-1.1.28.exe`.
- New manual installer: `app/dist-test-drive/tdqsys-test-drive-1.1.28.exe`.
- Back up the installation's queue state/videos through existing Settings
  before manually installing on a test laptop. Use a test location identity
  for registration testing rather than borrowing a live location's identity.

## Implemented paths

- Settings: printable model shortnames, waiver, Terms, callback wording, and
  Google Sheets URL.
- Local speech: packaged Kokoro voice list, safe fallback, prefix/main/suffix
  templates, validated placeholders, and voice/announcement/call-back previews.
- Backup restore: source/destination identity confirmation, destination licence
  and writer-token preservation, and a retained queue-state safety copy.
- SE registration: daily code, encrypted slip storage, printed-slip queue.
- Client registration: four steps, consent text hashes/snapshots, SE prefill,
  server-side code revalidation, retry identity, and per-model tickets.
- Facilitator Dashboard (`dashboard.html`): active-run board, Ongoing/Done/No Show/Call
  Back, Master Table search, earlier same-day runs, reprint/new-number,
  add-model/change-model, registrant CSV backup, and reset to a new run.
  Each model has its own ongoing client and display number.
- Master Table (`master-table.html`) and Print Queue (`print-queue.html`) are
  separate desktop pages linked from the dashboard. The former Test Drive
  Operations address redirects to the dashboard; the old plus/minus board is
  replaced. Each model column shows its full name, unique registrant total,
  then ticket prefix/number, client name, status and four actions on one line.
- Branded dashboard: the original centered heading/button layout and black
  background are restored. Each brand has its own Controls heading and accent
  line. Brand 2 gets `dashboard-brand2.html` only when enabled in Settings.
  Up to three wide vehicle columns fit across; extra models scroll horizontally.
  Each client's number, name, status and four buttons share one line.
- Event Setup / QR Codes (`event-setup.html`) and Registered Sales Exec Master
  List (`sales-executives.html`) are dedicated desktop pages. The SE list shows
  name, dealership, operating date, expiry and active code, with search/history.
  SE codes appear in Print Queue's queue/code column, including leading zeros.
  The SE label keeps its four-digit code at 36pt (twice the previous 18pt) and
  fits the name within the 50 x 30mm label without shrinking the code.
- Printer list comes from the installed Windows printers. A successful spool
  submission removes a ticket from pending. Physical output must be checked
  during hardware acceptance; spool success alone cannot detect empty labels.
- A claimed job whose outcome could not be recorded has manual recovery
  controls. Check physical output before choosing Confirm printed or Retry.
- Google Sheets jobs retain a raw submission snapshot, retry with backoff,
  and check Registration ID before appending after an interrupted request.
  Model changes/reissues do not change the original Sheets row.

## Cloud prerequisites

### Verified deployment on 1 November 2026

The additive schema, private operations function, Google service-account
secret, and matching Pages/Edge encryption secrets are now deployed. The
working registration preview is:

`https://test-drive-preview.tdqsys.pages.dev`

A live probe passed SE registration/code validation, client registration,
idempotent retries, duplicate ticket handling, encrypted SE slip retrieval,
Ongoing, same-day reset/history, and the deployed Google Sheets worker. Its
disposable location records and temporary Google tab were removed afterward;
the real giveaway tab was left untouched. No physical printing was attempted.

For the manual test installation, set **System Settings > Cloud Base URL** to
the preview address above, paste the selected Google Sheets tab URL, and save.
Open System Settings from the installed TDQSYS app on the laptop. There is no
online setup page: Cloudflare blocks Settings, the facilitator dashboard, and
Test Drive Operations URLs. Only the registration forms and public queue
displays are intended for online users.
Open **Event Setup / QR Codes** from the facilitator header for registration QR codes.
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
**Connect Sheet / prepare today's tab**, save, then **Sync saved Settings** in Test
Drive Operations. Repeat with a different Sheet at the other two locations.
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

```powershell
node tests\run.js
npm.cmd install --prefix .dev-db --no-package-lock --no-audit --no-fund @electric-sql/pglite
node tests\test-drive-db.integration.js
npm.cmd run --prefix app build:installer -- --config.directories.output=dist-test-drive --config.nsis.artifactName=tdqsys-test-drive-1.1.28.exe
```

The extra integration runner executes the migration and its database functions
using an isolated PostgreSQL runtime. The normal suite remains dependency-free.
See [PGlite execution API](https://pglite.dev/docs/api).

Latest automated verification: 260 passing tests, three optional skips, and
14 PostgreSQL integration checks. The rebuilt packaged speech engine was
checked with actual synthesis, its 54-voice catalog, saved selection, and
missing-voice fallback. Desktop/public route boundaries passed on both sites.

## Required manual acceptance at each of the three locations

1. Install manually; confirm the licence and existing display/video behavior.
2. Select the actual label printer and its 50 x 30 mm stock; verify clipping,
   header/number sizes, printing failures, and recovery with physical output.
3. Save vehicle shortnames, real waiver/Terms, and Sheets URL; open Test Drive
   Dashboard and download its two QR images. Confirm Sheets setup is shown
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

This installer is a development artifact. Live cloud, physical printer,
three-location, and manual installation acceptance remain required before a
production release version is increased.
