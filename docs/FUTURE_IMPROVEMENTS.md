# TDQSYS Future Improvements

## 12 November media audio ducking

Display and viewer now lower ad audio to 10% of its previous volume during
speech and restore that same volume after the speech queue finishes.
Reentrant calls and failed/rejected playback cannot restore volume too early.
Announcement text, scheduling, queue controls and master volume are unchanged.
Tests: 210 pass / 12 skipped. Physical listening test remains pending.

Local test installer is in the canonical tdqsys folder:
app/dist-test-drive-v1-ducking-20261112/tdqsys-v1-ducking-setup-1.1.28.exe
225640845 bytes; SHA256:
2fbbeb4637fbb2a0ab00d94e2d62aeb729cbb742083ff2ce273466e5359bbcb2
The package reuses the actual stable v1 core/app.asar, engine and TTS binary,
with only the reviewed display/viewer/helper files replaced. No published
asset, OTA manifest, version or live record changed. No install was performed.



This document records approved future-feature ideas. It is not a change to the current production release.
#### Phase 1

## Preserve installation identity during backup restore

TDQSYS currently stores its randomly generated Instance ID in `data.json`, which is included in every backup. Restoring a backup from a different installation can therefore replace the destination PC's Instance ID, cloud mirror identity, and license binding.

A future restore workflow must restore queue data, configuration, and videos while retaining the destination installation's `instanceId` and `cloudWriterToken` when `data.json` already exists. This prevents a cross-location backup from deactivating the receiving installation or redirecting its cloud mirror.

- Show the source and destination Instance IDs before confirming a restore.
- Warn explicitly when the backup was created by another installation.
- Preserve the destination identity by default; only a deliberate supported migration flow may transfer an identity.
- Add regression coverage for restoring Instance B onto licensed Instance A: A remains licensed and its cloud mirror remains keyed to A.

## Configurable announcement voice

TDQSYS currently uses the locally packaged **Kokoro ONNX** text-to-speech engine for queue announcements, with `af_heart` as the default voice. Future voice selection should extend this existing local engine rather than depend on a cloud TTS service or Windows system voices.

Add a Settings option that lets an authorised operator select from the Kokoro voices packaged with TDQSYS.

- List the Kokoro voices available in the installed TDQSYS package.
- Retain the current voice as the default and safe fallback.
- Provide a **Test voice** action before saving the selection.
- Store the selected voice in the location configuration.
- If a saved voice is no longer packaged with the app, automatically use the default voice and show a clear Settings notice.
- Keep synthesis local so announcements continue working without internet access.

## Configurable announcement wording

Allow an authorised operator to configure announcement wording around the normal queue message.

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

## Acceptance criteria for a future implementation

1. A selected available voice is used in the next queue announcement.
2. A missing saved voice falls back safely without preventing announcements.
3. Prefix, ticket/destination content, and suffix are announced in the configured order.
4. Invalid placeholders cannot be saved.
5. Revoked or unlicensed installations remain read-only and cannot modify these settings.

#### Phase 2

## Test-drive registration and live queue dashboard

Introduce a web-based registration flow that feeds a test-drive dashboard and the existing customer display.

### Test-drive Settings configuration

In the vehicle configuration table, add a **Printable shortname** column beside each vehicle model's full name. The shortname is configured by the test-drive administrator and must fit the 50 mm × 30 mm queue-ticket header. It is the `[Header]` printed above the assigned queue number; the full vehicle name remains available in the registration form, dashboard, master table, and audit history.

Add two facilitator-editable Settings fields: **Waiver statement** and **Terms and Conditions**. Both are shown in the client form's Consent step and their exact saved versions are recorded with each accepted registration. Seed each field with Lorem Ipsum placeholder text so the public web form never presents an empty waiver or Terms and Conditions statement. The facilitator must replace the placeholders with approved dealership wording before event use.

### Operating day and daily queue numbers

Test-drive queues operate by the dealership's configured local **operating day**. The server, rather than a customer phone, determines the operating day. Every active vehicle model begins the new day's counter at zero; the first committed entry is normally issued queue number `01` (or the configured prefixed equivalent). Live registration, dashboard, display, and print-queue queries show only the current operating day, so prior-date registrants are disregarded operationally without deleting their records.

Each operating day may contain one or more **queue runs**. A new day opens its first run automatically. The facilitator's **Reset to Zero** action asks for a reset reason (including **Testing**), closes the current run, and opens a new run for the same day, with each model's live allocation restarted from zero and the active display cleared. This supports testing or an operational restart on the same day without deleting client details, rewriting historical queue numbers, or creating duplicate numbers inside a run. Every test-drive entry, display state, print entry, and reprint decision must carry its queue-run identity.

Historical registrations, queue entries, print history, and lead data must remain available to authorised personnel. A unique database constraint must prevent duplicate queue numbers for the same location, operating day, and vehicle model.

### Sales Executive daily check-in and registration authorisation

Clients may open the web form by scanning its QR code, but may submit only when they are accompanied by a checked-in Sales Executive (SE).

1. At the start of the operating day, each SE completes a separate public SE registration form with their name and dealership. TDQSYS creates the daily check-in and assigns a unique four-digit code for that location and operating day.
2. The client completes the form, waiver, and terms and conditions, then enters the accompanying SE's code.
3. The server validates the active code and returns only the display details needed by the form: the SE's name and dealership.
4. The form pre-fills and displays those details. Its Submit control remains disabled until a valid code has been confirmed and the required waiver and terms acknowledgements are complete.
5. On submission, the registration stores the linked SE check-in and the exact waiver/terms version and consent timestamp.

A four-digit code is an accompaniment check, not a high-assurance identity credential. The code generator must check previously issued daily SE codes in the SE database and retry until it finds an available candidate; a location-and-operating-day uniqueness constraint is the final protection against a race-condition duplicate. Codes expire at the dealership's local midnight, are stored as hashes, and are validated only server-side. Rate-limit failed public attempts and apply a short lockout after repeated incorrect entries. The client-registration page must not enumerate the staff list, retrieve staff contact information, or gain operator permissions.

The SE Registration page has its own QR code, which an SE scans to open the page on a mobile device. Name and dealership are required. On successful submission, the SE daily check-in and assigned code are recorded in the SE table. The page shows the assigned four-digit code and the message, **“Collect your printed code at the registration booth.”** The desktop Print Queue includes a separate SE-code print entry; either member of the facilitator team may print it through the NIMBOT B1. The SE code slip displays the SE name and unique four-digit code.

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
and 2nd is to append the raw client-registration data to Google Sheets "TDQ REGISTRATION" for giveaway tracking. Google Sheets is client-based, not test-drive-model or queue-number-based: later changes to a client's vehicle models do not update or add a Sheets row. Corrections are not required. The Google Sheets integration must retry silently in the background from a recorded outbox/job; a temporary Sheets failure must not interrupt the client registration flow, create a duplicate registration, or change committed queue numbers.

### Database structure

Use normalized, location-scoped records rather than one physical table per vehicle model. Adding or retiring a model must not require a database schema change.

| Record | Purpose |
| --- | --- |
| `vehicle_models` | Available models, including full name, printable shortname, and active/retired status. |
| `sales_executives` | Sales Executive identity and active status. |
| `se_daily_checkins` | Operating-day check-in, four-digit-code hash, check-in/out times. |
| `registrations` | Customer details, consent details, timestamp, and linked SE check-in. |
| `queue_runs` | A numbered live queue session within one operating day, including reset reason, start/end timestamps, and active/closed status. |
| `test_drive_entries` | One row per registration/model: operating day, queue run, queue number, and `waiting`, `ongoing`, `done`, `no_show`, or `cancelled` status. |
| `print_jobs` | Facilitator print/reprint state and attempts for one committed test-drive entry or an SE-code slip. |
| `sheet_sync_jobs` | Reliable delivery status for the Google Sheets giveaway-tracking update. |
| `audit_log` | Sensitive operational actions, exports, settings changes, and reset/archive actions. |

Every record must be scoped to the TDQSYS installation/location identity. Public QR viewers must never read contact details or these operational records; the existing public queue-state document remains free of personal data.

### Dashboard behaviour

The facilitator's Test Drive Queue List is a compact current-operating-day board for up to 12 active vehicle models. Each vehicle model is a column header; its entries show only the queue number and customer name, keeping the board usable when all 12 units are in use. The selected model is inherent in the column header, so it need not be repeated in each row.

Each customer row has these actions:

- **Ongoing** — makes that customer the active test drive for that vehicle model.
- **Done** — marks the customer's test drive complete.
- **No Show** — records that the customer did not attend.
- **Call Back** — repeats a configurable announcement for that customer without changing their queue status.

The dashboard also shows live registration totals:

- A total registrant count for each vehicle model.
- An overall total across all vehicle models.

The facilitator board must retain the required per-model and overall totals without sacrificing the compact 12-column view. A separate authorised detail/master view may show the full raw registration record when needed.

Only one test-drive entry may be `ongoing` at a time for the entire location, preserving the existing one-number behaviour of `display_with_ads.html`. The facilitator manually selects **Ongoing** beside the next client in the queue. This marks any previous ongoing entry `done`, makes the selected entry ongoing, and updates the displayed queue number. **Ongoing** is the only dashboard action that updates `display_with_ads.html`; the existing plus/minus counter controls are replaced for the test-drive workflow by this action.

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

Selecting **Ongoing** updates the existing customer display with that registration's assigned queue number and relevant vehicle-model context. Selecting another customer as ongoing completes the preceding active record first, then replaces the display with the new active customer's queue number. The display never shows more than one ongoing test-drive entry.

#### Phase 3

### Facilitator-managed queue-ticket printing

After a successful registration submission, commit all selected-model queue entries and create one **pending print entry** for each selected model. Do not print automatically from the web form.

The TDQSYS desktop app provides a shared **Print Queue** page for the two-person facilitator team operating one laptop. Either team member may print, reprint, cancel, reissue, or add a model; separate per-person permissions are not required for this workflow. It displays only queue number, customer name, and car model for client tickets, with a separate clearly labelled entry type for an SE-code slip. A client who selected three models has three separate print entries, one for each ticket. The facilitator selects one entry at a time, starts printing, then marks it as handed over. Once printed, remove that entry from the active Print Queue.

Claiming a print entry must be atomic, so an accidental double-click or later multi-device use cannot print the same ticket simultaneously. Print states should include at least `pending`, `claimed`, `printed`, `failed`, and `handed_over`.

**Target printer:** NIMBOT B1 label printer. The implementation should use the PC's supported connection method and validate the available Windows driver, local print bridge, or documented device protocol before development begins.

- Create and commit all selected-model queue records before starting any print job.
- Print one queue number for every vehicle model selected by the client. For example, selecting three models produces three queue entries and three printed queue numbers.
- Each printed item must identify the relevant vehicle model and show the queue number assigned by that model's table or queue record.
- The NIMBOT B1 label size is **50 mm × 30 mm**. Its layout is the configured printable shortname `[Header]` on the first line and `[Queue no.]` below it. The header is bold and uses a larger font than the queue number.
- The print layout should also include the registration date/time and a short instruction for the client, without printing unnecessary personal contact information.
- Use the configured NIMBOT B1 label printer; provide a clear retry/reprint action when it is unavailable, disconnected, offline, or out of labels.
- A print failure must not discard the submitted registration or issue a different queue number on retry. The failed entry remains visible in the facilitator Print Queue until it is printed or deliberately cancelled.
- Reprinting is initiated from an authorised master table by searching for the client name. Reprint the original queue number only while that number has not yet been passed. Once it has been passed, create a new queue entry and issue a new number instead; never alter the previous assigned number.
- If a registered client returns to add or change a model, the facilitator finds the existing registration rather than requiring the client to submit the form again. Adding a model creates a new entry and queue number. Changing a model preserves the prior entry in history, marks it as `cancelled` with an audit reason, and creates a new entry and queue number for the requested model.
- The Test Drive Queue List, Print Queue, and customer display show only the active queue run. The Master Table also defaults to the active run, but provides an **Earlier runs today** filter and name search for audit and lookup. Earlier-run entries are read-only: they cannot be resumed or reprinted. A returning client may instead be issued a new entry in the active run with a new queue number.
- Record print status and time for operational troubleshooting and audit purposes.
- Design and test the label layout for the printer's selected label size, including a readable queue number and vehicle-model name.

#### Phase 4

### Lead-data retention, cleanup, and reset safeguards

Registration records are client marketing leads, not disposable queue numbers. The future implementation must preserve and protect this data accordingly.

When an operator changes the available vehicle models in Settings, the system should soft-retire models that are no longer offered. If a retired model contains registrants, the operator must first be offered an export/backup of those registrants and must explicitly confirm any archival or deletion action. Historical model identity and its linked registrations must remain intact unless a separate, deliberate retention action permits deletion.

Announcement prefix, suffix, callback prefix, and callback suffix values may be replaced when saved in Settings. Changes should be auditable and should not alter previously stored registration records, queue history, or printed-ticket data.

The daily operating-day boundary opens a new queue run; a same-day **Reset to Zero** closes the active run and opens another. Neither action deletes or alters historical registrations. Reset to Zero must never silently remove lead data. Before any exceptional reset, archive, or deletion takes place:

1. Offer a backup/export of all registrants, including contact details, selected vehicle models, queue numbers, statuses, timestamps, and print information.
2. Clearly state whether the action resets only the live queue counters or also archives/deletes historical registration records.
3. Require explicit confirmation after the backup option is presented.
4. Keep a reset audit record with the operator, timestamp, scope, and backup/export outcome.

The preferred default is to close the current operating day while retaining historical registrations in an archive that can be exported by authorised client personnel. Permanent deletion of marketing leads should require a separate, deliberate data-retention action rather than being coupled to an operational queue reset.

### Acceptance criteria for a future implementation

1. A client can select one or more models and receives a queue entry for each selected model only after entering a valid, active daily SE code and accepting the required waiver and terms.
2. Submitted entries appear in the matching model list without manual refresh.
3. A location never has more than one ongoing test-drive entry, and selecting Ongoing updates the existing customer display.
4. Selecting a new ongoing customer atomically marks the prior ongoing customer as done and updates the display.
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
20. The active Print Queue displays only queue number, customer name, and car model; successfully printed entries no longer appear there.
21. A passed queue number is never edited or reprinted. Reissue, added-model, and changed-model actions create new queue entries while preserving the original entry and an audit record.
22. An SE code expires automatically at the dealership's local midnight, even if the SE has not checked out.
23. A Google Sheets failure is retried silently in the background and never blocks a successful committed registration or changes its queue numbers.
24. An SE can open the daily registration form from its QR code, submit a required name and dealership, and receive a NIMBOT-printed slip containing their name and unique four-digit code.
25. The client form follows the required Details, Test-drive Choices, Consent, and SE Validation steps; only Application and Reservation are optional.
26. Google Sheets receives one immutable raw client-registration row per successful client submission. Later model or queue changes do not create or modify a Sheets row.
27. A No Show entry remains an auditable marker; a returning client receives a new queue entry rather than a changed no-show number.
28. The 50 mm × 30 mm NIMBOT label prints the bold, larger Header above the Queue no.
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

This phase converts the approved workflow into a private Supabase data model,
public registration endpoints, and desktop-only operational endpoints. It does
not expose registration data through the existing public `queue_state` record
or QR queue viewer.

### Storage model

All tables are scoped by `instance_id`, the TDQSYS installation/location
identity. The server assigns identifiers, timestamps, operating days, and
queue numbers; no phone-provided value is trusted for those fields.

| Table | Required fields and purpose |
| --- | --- |
| `vehicle_models` | `id`, `instance_id`, `full_name`, `printable_shortname`, `active`, `retired_at`. The active models drive the client form; do not physically delete a retired model with history. |
| `sales_executives` | `id`, `instance_id`, `name`, `dealership`, `active`, `created_at`. This is the durable SE directory created by the daily SE form. |
| `se_daily_checkins` | `id`, `instance_id`, `sales_executive_id`, `operating_day`, `code_hash`, `code_ciphertext`, `issued_at`, `expires_at`. `code_hash` supports validation and uniqueness; encrypted code storage allows the assigned code slip to be printed again. |
| `queue_runs` | `id`, `instance_id`, `operating_day`, `run_number`, `status`, `opened_at`, `closed_at`, `reset_reason`, `opened_by`. Exactly one run is active per location. |
| `queue_counters` | `queue_run_id`, `vehicle_model_id`, `last_issued_number`. This row is locked and incremented when a new ticket is allocated; it starts at zero for each run and model. |
| `registrations` | `id`, `instance_id`, `full_name`, `name_search`, `email`, `city_address`, `contact_number`, `for_application`, `for_reservation`, `se_daily_checkin_id`, `waiver_version`, `terms_version`, `consented_at`, `submitted_at`. Raw client information lives here. |
| `test_drive_entries` | `id`, `instance_id`, `registration_id`, `queue_run_id`, `vehicle_model_id`, `queue_number`, `status`, `replaced_entry_id`, `issued_at`, `status_changed_at`, `status_changed_by`. An entry is never edited to reuse a number. |
| `print_jobs` | `id`, `instance_id`, `kind` (`client_ticket` or `se_code_slip`), `test_drive_entry_id` or `se_daily_checkin_id`, `status`, `claimed_at`, `printed_at`, `handed_over_at`, `attempt_count`, `last_error`. |
| `display_state` | `instance_id`, `queue_run_id`, `active_test_drive_entry_id`, `updated_at`. This contains only display-safe active-ticket context; it is the source used to update `display_with_ads.html`. |
| `sheet_sync_jobs` | `id`, `registration_id`, `payload_snapshot`, `status`, `attempt_count`, `next_attempt_at`, `last_error`, `completed_at`. It appends one raw client-registration row to Google Sheets. |
| `audit_log` | `id`, `instance_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `details`, `created_at`. It records reset, issue, reissue, print, status, and export activity. |

### Database rules and transactions

- Enforce unique SE codes by `instance_id`, `operating_day`, and `code_hash`.
- Enforce one active queue run per `instance_id` and one unique ticket by `queue_run_id`, `vehicle_model_id`, and `queue_number`.
- Enforce no more than one `ongoing` test-drive entry for the active location/run.
- Ticket allocation locks the matching `queue_counters` row, increments it, creates the test-drive entry and pending client print job, then commits all of those changes together.
- A same-day Reset to Zero transaction closes the active run, clears its display state, creates the next `run_number`, creates its zeroed model counters, and writes an audit record. It never updates previous entries' queue numbers.
- Selecting Ongoing atomically changes the previous ongoing entry to `done`, marks the chosen entry `ongoing`, updates `display_state`, and writes its audit record.
- Duplicate-name/model checking, passed-number logic, reissue, add-model, and model-change actions execute on the server inside a transaction. Model changes cancel the original entry and create a new entry; they never mutate its assigned number.

### Endpoint boundary

Public Pages forms call dedicated registration endpoints. These endpoints use
server-side credentials and return only data safe for the caller. They never
return the TDQSYS writer token, service-role key, full SE list, operational
queues, or another location's data.

| Endpoint/action | Caller | Result |
| --- | --- | --- |
| `POST /api/test-drive/se-checkins` | Public SE QR form | Validates name/dealership, creates daily SE check-in and pending SE-code print job, returns the assigned four-digit code and collection message. |
| `POST /api/test-drive/se-code/validate` | Public client form | Validates the active unexpired code and returns only SE name, dealership, and a short-lived server-signed proof. |
| `POST /api/test-drive/registrations` | Public client form | Validates all required data, consent, proof, and selected active models; applies duplicate-name/model logic; commits new entries/print jobs and creates a Google Sheets sync job. Returns existing unpassed or new queue numbers and the collection message. |
| `GET /api/test-drive/operations` | TDQSYS desktop only | Returns the active-run queue board, Print Queue, and authorised Master Table search results. |
| `POST /api/test-drive/entries/:id/ongoing` | TDQSYS desktop only | Atomically advances the single live display ticket. |
| `POST /api/test-drive/entries/:id/status` | TDQSYS desktop only | Marks an entry done, no-show, or cancelled where the transition is allowed. |
| `POST /api/test-drive/runs/reset` | TDQSYS desktop only | Requires a reset reason; closes the active run and opens a new same-day or next-day run. |
| `POST /api/test-drive/print-jobs/:id/claim` | TDQSYS desktop only | Atomically claims the next SE-code or client-ticket job. |
| `POST /api/test-drive/print-jobs/:id/result` | TDQSYS desktop only | Records printed, failed, or handed-over outcome without changing its ticket number. |
| `POST /api/test-drive/entries/:id/reissue` | TDQSYS desktop only | Reprints an unpassed ticket or creates a new current-run ticket if the old one has passed. |
| `POST /api/test-drive/registrations/:id/models` | TDQSYS desktop only | Adds a model or cancels/replaces a selected model by creating a new ticket entry. |

Desktop-only endpoints authenticate the installed TDQSYS application using the
existing per-installation writer credential over TLS. The server validates that
credential against `instance_id`; public browsers never receive it. Existing
licence state remains the write gate for all desktop mutations.

### Background work and failure handling

- The registration transaction writes a `sheet_sync_jobs` record but does not
  wait for Google Sheets. A scheduled worker retries pending jobs silently with
  backoff until they succeed; duplicate delivery is prevented with the
  registration ID as the external idempotency key.
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
4. Two Ongoing actions cannot leave two entries ongoing or update the display inconsistently.
5. A same-day Testing reset creates a new run, starts from zero, and preserves earlier-run records.
6. An unpassed ticket reprints unchanged; a passed ticket is reissued with a new entry and number.
7. No-show and changed-model flows retain the original entry and audit history.
8. A failed NIMBOT job and a failed Google Sheets job retry without changing committed registration or queue data.
9. Public endpoints cannot retrieve PII, operations, staff lists, or another location's records beyond their permitted response.
10. Unlicensed, expired, revoked, and reinstated desktop states keep the required write restrictions.
