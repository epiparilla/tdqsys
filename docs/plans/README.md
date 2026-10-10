# Parked plans

Three substantial pieces of work, decided and specified but not yet built.
Persisted here so they survive session loss.

| Plan | Status | Notes |
|---|---|---|
| [Task 1 — Firebase mirror migration](task-1-firebase-migration.md) | Parked, decided | Cloudflare free tier failed daily during a 4-day event |
| [Task 2 — Licensing & authorisation](task-2-licensing.md) | **Ready to build** | Decisions complete |
| [Task 3 — macOS port](task-3-macos-port.md) | **On hold** | Parked at user request |

## Prerequisite for all three

The `tests/` harness (`node --test tests/`) must be green against v1.1.15 first.
Every test maps to a real defect hit during the session that produced these
plans — it exists so we verify rather than trust judgement.

## Hard-won environment notes

- **Windows PowerShell 5.1 only.** `&&` does not work; use `;` or `if ($?) { }`.
  `head`, `tail` and `grep` are not installed.
- **Headless Chrome/Edge refuse to launch here.** Verify UI by reading code or
  by testing pure functions in Node — say so plainly rather than claiming a
  visual check.
- **Never run `wrangler pages deploy` from `Autofocus cloud`.** It deploys the
  same `tdqsys` Pages project and has already shipped stale assets once.
- **Clear `.wrangler` before every deploy.** A stale manifest makes wrangler
  report `Uploaded 0 files (N already uploaded)` and silently ship the previous
  build.
- **Deploys do not imply git pushes**, and vice versa.
- GitHub release assets must be named lowercase — GitHub sanitises
  `TDQSYS Setup 1.1.15.exe` into dots, which breaks the URL in `version.json`.
- Create the tag **after** the `version.json` commit, or the tag points at a
  commit without the manifest.