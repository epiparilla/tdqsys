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
- SE registration: daily code, encrypted slip storage, printed-slip queue.
- Client registration: four steps, consent text hashes/snapshots, SE prefill,
  server-side code revalidation, retry identity, and per-model tickets.
- Desktop Test Drive Operations: active-run board, Ongoing/Done/No Show/Call
  Back, Master Table search, earlier same-day runs, reprint/new-number,
  add-model/change-model, registrant CSV backup, and reset to a new run.
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
Open **Facilitator Dashboard > Test Drive Operations > Event setup**, select
**Sync saved Settings**, then choose the installed label printer in Print Queue.
The existing production site, release assets, and update manifest remain at
their checkpoint state.

The steps below remain a deployment reference for future environments.

1. Authenticate the Supabase CLI for the existing project
   `pnyptdyfkftrcgjlaqnr` using `npx supabase login`.
2. Apply `supabase/migrations/202611010001_test_drive_platform.sql` once, after
   the existing queue-state migration. It creates separate private tables and
   does not change the released app's public queue mirror.
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
7. Open an empty Google tracking tab and paste its full URL (including `gid`)
   into Settings. On its first write TDQSYS creates its eleven column headers,
   beginning with Registration ID. It refuses to overwrite a tab with
   different existing columns. [Google Sheets value-write behavior](https://developers.google.com/workspace/sheets/api/guides/values).

The current retry worker runs every 15 seconds while Test Drive Operations is
open. Pending jobs remain durable when it is closed and resume on reopening.
An independent scheduled cloud worker is not yet installed.

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

## Required manual acceptance at each of the three locations

1. Install manually; confirm the licence and existing display/video behavior.
2. Select the actual label printer and its 50 x 30 mm stock; verify clipping,
   header/number sizes, printing failures, and recovery with physical output.
3. Save vehicle shortnames, real waiver/Terms, and Sheets URL; open Test Drive
   Operations and Sync saved Settings. Download its two QR images.
4. Register an SE on a phone, print its code slip, register a client for
   multiple models, and collect the separate labels.
5. Exercise Ongoing, Done, No Show, Call Back, duplicate submission, reprint,
   passed-number reissue, add/change model, and Master Table search.
6. Reset during the same day. Confirm new numbers begin at 01, old entries are
   read-only in Earlier runs today, and prior client details remain intact.
7. Disconnect/reconnect the internet and printer, check silent Sheets recovery,
   confirm one Sheets row per original submission, and confirm another
   location cannot see this location's clients.

This installer is a development artifact. Live cloud, physical printer,
three-location, and manual installation acceptance remain required before a
production release version is increased.
