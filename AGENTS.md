# tdqsys — working notes for AI agents

Canonical repo. Pages project `tdqsys` → https://tdqsys.pages.dev.

**If you were launched in `..\Autofocus cloud`, that folder is a read-only
reference project, not this one.** All edits, builds and deploys belong here.

## Deploy

Always from this directory, and always clear the wrangler cache first. A stale
`.wrangler` manifest makes wrangler report `Uploaded 0 files (N already
uploaded)` and silently ship the *previous* build:

```powershell
Remove-Item -Recurse -Force .wrangler -ErrorAction SilentlyContinue
npx wrangler pages deploy "public" --project-name tdqsys --commit-dirty=true --skip-caching
```

Deploys are not atomic with git — commit and push **and** deploy; neither
implies the other.

## Tests

```powershell
node tests\run.js
```

Zero dependencies (`node:test` only), so it runs on a clean checkout with no
`npm install`. The suite boots the real engine against a temp data dir on port
18081 — it can never touch a live location.

**Run it before publishing anything.** It cannot ship to customers: the
`build.files` whitelist is `main.js`, `preload.js`, `icon.png` and
`extraResources` copies only `app/server`.

Current state: 99 passing, 1 skipped (the optional QR end-to-end decode, which
needs `jsqr`).

Every test maps to a defect that actually occurred. If a change is subtle enough
to be dangerous, add the test that would have caught it.

## Build / release

```powershell
(Get-Content app\package.json -Raw) -replace '"version": "1.1.X"','"version": "1.1.Y"' | Set-Content app\package.json -NoNewline
npm run --prefix app build:installer    # runs assemble:server, then electron-builder --win nsis
npm run --prefix app build:portable
```

`assemble-server.ps1` copies `public/` into `app/server/public`, which ships
inside the installer. **A Pages deploy cannot change what an installed app
serves** — anything user-visible in the local app needs an installer build.

Release assets must be named lowercase (`tdqsys-setup-<v>.exe`); GitHub
sanitises `TDQSYS Setup <v>.exe` into dots, which breaks the URL in
`version.json`. Rename via the API after upload.

## Update mechanism

`app/main.js` compares `public/version.json.version` against `app.getVersion()`.
`url` and `size` must match the *actual* published asset — the updater verifies
byte size, and a stale URL hands an older binary to a newer app.

## Architecture notes that are easy to get wrong

- **Cloud reads must carry `?id=<instanceId>`.** A bare `/api/data` resolves to
  the legacy shared record `sites/auto-01/state` and shows one location's queue
  to everybody. `afCloudQuery()` returns `null` when no instance is known and the
  fetchers refuse to request, so the viewer shows "No location selected".
- **One `public/index.html` serves two audiences.** The local engine
  (`video_server.js`) serves it for `/` and `main.js` opens it in the app, while
  Pages serves it as the public site. Local-only links are marked
  `data-hub="local"` and removed at parse time off-box. Do not edit that file
  assuming it is web-only — it previously gutted the local hub.
- **`/display` is retired.** The TV board ships as `display_with_ads.html`.
- **Pages needs `public/404.html`** to return a real 404. Without it, unmatched
  paths fall back to `index.html` with a **200**.
- Phone CSS is gated on `pointer: coarse`; width alone also matches the desktop
  app's 640x400 preview window and would restyle it.

## Environment gotchas (Windows PowerShell 5.1)

`&&` does not work — use `;` or `if ($?) { }`. `head`, `tail` and `grep` are not
installed. Headless Chrome/Edge refuse to launch here, so verify UI changes by
reading the code or by testing pure functions in Node — say so plainly rather
than claiming a visual check.

Cloudflare's OAuth token in `~\.wrangler` has `zone (read)` but **no cache
purge scope**, so a stale edge-cached asset cannot be purged from here.