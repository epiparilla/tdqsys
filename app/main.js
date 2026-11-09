// TDQSYS desktop app - main process.
// Responsibilities:
//  1. Spawn/own the local queue engine (video_server.js) and TTS server (tts_server.py)
//  2. Open the display window on the correct screen (auto-detect 2nd display)
//  3. Own cloud sync (single push source) when AF_OWNER_SYNC is passed to the engine
//  4. Open the settings/dashboard screen on the main (local) monitor
// Portable mode: data and videos live next to the app (AF_DATA_DIR = __dirname).
// Installed mode: AF_DATA_DIR = %APPDATA%/TDQSYS (set by the desktop app).

const { app, BrowserWindow, Tray, Menu, screen, ipcMain, dialog, shell } = require('electron');
const { spawn, execFileSync } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {PRODUCT,validateManifest,findOwnUninstaller}=require('./product');
// Set Chromium profile and lock identity before any windows or single-instance lock.
app.setName(PRODUCT.name);
const PROFILE_DIR=path.join(app.getPath('appData'),PRODUCT.name,'electron-profile');
fs.mkdirSync(PROFILE_DIR,{recursive:true});
app.setPath('userData',PROFILE_DIR);
if(process.platform==='win32')app.setAppUserModelId(PRODUCT.id);
const TTS_PLAYBACK_TOKEN = crypto.randomBytes(32).toString('hex');

const IS_PACKAGED = app.isPackaged;
const APP_DIR = __dirname;

// ---- Paths ----
// Dev (npx electron .): engine/TTS run from the project root; AF_DATA_DIR unset
// the engine uses the project root data.json/videos exactly like `node video_server.js`.
// Installed (NSIS): engine/TTS/site/models live in resources/server/; data + imported
// videos go to %APPDATA%\TDQSYS (AF_DATA_DIR). See assemble-server.ps1.
const IS_INSTALLED = app.isPackaged;
const RES_SERVER = IS_INSTALLED ? path.join(process.resourcesPath, 'server') : path.join(APP_DIR, '..');
const BASE_DIR = IS_INSTALLED
    ? (process.env.AF_DATA_DIR || path.join(app.getPath('appData'), PRODUCT.name))
    : (process.env.AF_DATA_DIR || path.join(APP_DIR, '..','.runtime-v2'));
const ENGINE_PATH = IS_INSTALLED
    ? path.join(RES_SERVER, 'video_server.js')
    : path.join(APP_DIR, '..', 'video_server.js');
const TTS_PATH = IS_INSTALLED
    ? path.join(RES_SERVER, PRODUCT.speechExecutable)
    : path.join(APP_DIR, '..', 'tts_server.py');
const PORT = parseInt(process.env.AF_PORT, 10) || PRODUCT.enginePort;
const TTS_PORT = parseInt(process.env.AF_TTS_PORT, 10) || PRODUCT.speechPort;

// ---- Uninstall (installed NSIS builds) ----
// The NSIS uninstaller lands in different spots depending on how the installer
// was run: "install for me only" -> %LOCALAPPDATA%\Programs, "install for all
// users" -> Program Files (or Program Files (x86)). Its presence also tells
// "installed" apart from "portable", which extracts to a temp dir and has no
// uninstaller at all.
const PRODUCT_NAME = PRODUCT.name;
function findUninstaller() {
    return app.isPackaged ? findOwnUninstaller(process.execPath,fs.existsSync) : null;
}
const UNINSTALLER_EXE = findUninstaller();

// First run of this installation: no local data yet when the app boots. The
// engine may seed a configuration from the cloud a moment later, so this flag
// must be captured BEFORE the engine starts. Drives the first-run wizard.
const FIRST_RUN = !fs.existsSync(path.join(BASE_DIR, 'data.json'));

let engineProcess = null;
let ttsProcess = null;
let tray = null;
let displayWindow = null;
let dashboardWindow = null;
let displayMode = 'auto'; // auto | external | preview (settings override later)

const log = (msg) => console.log(`[desktop] ${msg}`);

// ---- local UI helpers ----
function engineDown() { return !engineProcess || engineProcess.exitCode !== null || engineProcess.killed; }

// Resolve and open a local page in a window at the right size/position.
function openLocalWindow({ page, width, height, fullscreen = false, x = undefined, y = undefined, minWidth = 200, minHeight = 120 }) {
    const win = new BrowserWindow({
        width, height,
        minWidth, minHeight,
        fullscreen,
        x, y,
        autoHideMenuBar: true,
        backgroundColor: '#050505',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    const url = `http://localhost:${PORT}/${page}`;
    win.loadURL(url);
    win.setMenu(null);

    // Dev-mode polish loop: edit HTML/CSS -> reload window (F5) / devtools (F12), no rebuild.
    if (!app.isPackaged) {
        win.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            if (input.key === 'F5') { win.webContents.reload(); event.preventDefault(); }
            if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
        });
    }

    win.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
        if (String(validatedURL).startsWith('http://localhost:')) {
            // Engine likely not up yet; retry shortly.
            setTimeout(() => { if (!win.isDestroyed()) win.loadURL(url); }, 1500);
        }
    });
    return win;
}

// ---- Licence status ----
// The engine always starts: an expired booth must keep serving cars, and the
// engine is what answers /api/license. So this is not a "do we run" gate - it
// decides what the operator sees and keeps the window title honest about why
// saving has stopped.
function licEngineUrl() { return `http://localhost:${PORT}/api/license`; }

async function refreshLicence() {
    try {
        const r = await fetch(licEngineUrl());
        if (!r.ok) return null;
        return await r.json();
    } catch (e) {
        return null;   // engine still coming up, or restarting
    }
}

function applyLicenceToTitle(st) {
    const win = dashboardWindow;
    if (!win || win.isDestroyed() || !st) return;

    // The page owns document.title, and it finishes loading AFTER our first
    // poll resolves - so a title set here would be overwritten a moment later.
    // Owning the title outright keeps the licence state visible no matter which
    // page is loaded or when.
    if (win.__ownTitle !== true) {
        win.__ownTitle = true;
        win.on('page-title-updated', (e) => {
            e.preventDefault();
            applyLicenceToTitle(win.__lastLicence);
        });
    }
    win.__lastLicence = st;

    const label = st.canWrite
        ? null
        : (st.state === 'expired' ? 'License expired' : (st.state === 'revoked' ? 'License revoked' : 'Not licensed'));
    if (label) win.setTitle(`TDQSYS - ${label}`);
    else if (win.__licenceTitle) win.setTitle('TDQSYS');
    win.__licenceTitle = label;
}

async function pollLicence() {
    const st = await refreshLicence();
    if (!st) return;
    if (!st.canWrite && !app.isQuitting) {
        log(`licence ${st.state}: ${st.detail || 'no detail'} (changes are disabled)`);
    }
    applyLicenceToTitle(st);
}

// ---- Engine & TTS process management ----
function startEngine() {
    if (app.isQuitting) return;
    log(`starting engine ${ENGINE_PATH} (port ${PORT}) dataDir=${BASE_DIR}`);
    engineProcess = spawn(process.execPath, [ENGINE_PATH], {
        cwd: path.dirname(ENGINE_PATH),
        env: {
            ...process.env,
            AF_DATA_DIR: BASE_DIR,
            AF_OWNER_SYNC: '1',
            AF_PORT: String(PORT),
            AF_TTS_PORT:String(TTS_PORT),
            ELECTRON_RUN_AS_NODE: '1'   // use Electron's embedded Node to run the engine
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true   // no visible console for the engine (runs headless)
    });
    engineProcess.stdout.on('data', d => log(`engine: ${d.toString().trim()}`));
    engineProcess.stderr.on('data', d => log(`engine: ${d.toString().trim()}`));
    // spawn() emits 'error' when the binary cannot be launched at all (missing
    // file, bad path, permission denied). With no listener that is an unhandled
    // error event, which takes the whole app down instead of retrying - and
    // Node emits 'close', not 'exit', in that case, so the handler below would
    // never get a chance to restart us.
    engineProcess.on('error', (err) => {
        log(`engine failed to start: ${err.message}`);
        if (app.isQuitting) return;
        setTimeout(startEngine, 2000);
    });
    engineProcess.on('exit', (code) => {
        if (app.isQuitting) return;   // real quit: never resurrect
        log(`engine exited (${code}). Restarting in 2s...`);
        setTimeout(startEngine, 2000);
    });
}

function startTTS() {
    if (app.isQuitting) return;
    if (!fs.existsSync(TTS_PATH)) { log('TTS server missing, skipping.'); return; }
    log(`starting TTS server (${TTS_PATH}) on port ${TTS_PORT}`);
    if (IS_INSTALLED) {
        // Installed build: packaged PyInstaller exe, run directly (no python on PATH).
        ttsProcess = spawn(TTS_PATH, [], {
            cwd: path.dirname(TTS_PATH),
            env: { ...process.env, AF_DATA_DIR: BASE_DIR, AF_TTS_PORT: String(TTS_PORT), AF_TTS_PLAYBACK_TOKEN:TTS_PLAYBACK_TOKEN },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true   // packaged TTS console-subsystem exe: keep it hidden
        });
    } else {
        // Dev: tts_server.py under system python, next to the engine in the project root.
        const python = process.env.AF_PYTHON || 'python';
        ttsProcess = spawn(python, [TTS_PATH], {
            cwd: path.dirname(TTS_PATH),
            env: { ...process.env, AF_DATA_DIR: BASE_DIR, AF_TTS_PORT: String(TTS_PORT), AF_TTS_PLAYBACK_TOKEN:TTS_PLAYBACK_TOKEN },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true   // dev python console: keep it hidden (darwin/linux: no-op)
        });
    }
    ttsProcess.stdout.on('data', d => log(`tts: ${d.toString().trim()}`));
    ttsProcess.stderr.on('data', d => log(`tts: ${d.toString().trim()}`));
    // Same reasoning as the engine: an unhandled 'error' from spawn() kills the
    // app rather than degrading. Most likely here is dev mode where `python`
    // may not exist on the PATH.
    ttsProcess.on('error', (err) => {
        log(`tts failed to start: ${err.message}`);
    });
    ttsProcess.on('exit', (code) => {
        log(`tts exited (${code}). Restarting in 3s...`);
        setTimeout(() => { if (!app.isQuitting) startTTS(); }, 3000);
    });
}

// ---- Cloud sync owned by desktop (single push source) ----
// Writes are change-triggered, not interval-triggered: the full state is only
// POSTed when a local change is detected (or on connect/startup), so an idle
// machine doesn't burn KV write operations. A slow keep-alive force-pushes
// once in a while as a safety net (e.g. cloud-side reset).
let cloudTimer = null;
let updatePollTimer = null;         // re-checks the manifest while running
let registrationTimer = null;
let registrationSyncBusy = false;
let registrationSettingsHash = null;
let registrationSyncStatus = {hasUrl:false};
let lastPushedHash = null;
const SUPABASE_URL = process.env.AF_SUPABASE_URL || 'https://pnyptdyfkftrcgjlaqnr.supabase.co';

function pushState(instanceId, writerToken, localData) {
    const url = `${SUPABASE_URL}/functions/v1/queue-sync`;
    // Never send the desktop writer credential inside the mirrored state: the
    // state is intentionally readable by QR viewers.
    const publicState = { ...localData, config: { ...(localData.config || {}) } };
    delete publicState.config.cloudWriterToken;
    const payload = JSON.stringify(publicState);
    const u = new URL(url);
    let resBody = '';
    const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'X-TDQSYS-Instance': instanceId,
            'X-TDQSYS-Writer': writerToken
        }
    }, (res) => {
        res.on('data', d => { resBody += d.toString(); });
        res.on('end', async () => {
            if (res.statusCode === 200) {
                lastPushedHash = crypto.createHash('sha256').update(payload).digest('hex');
                try {
                    const lic = require(path.join(RES_SERVER, 'shared', 'licence.js'));
                    if (lic.isRevoked(BASE_DIR)) {
                        log(`[desktop] Push accepted by Supabase (200) - remote revocation was cancelled! Reinstating licence...`);
                        lic.reinstate(BASE_DIR, instanceId);
                        await pollLicence();
                        [dashboardWindow, displayWindow].forEach(w => {
                            if (w && !w.isDestroyed()) w.webContents.send('af:licence-reinstated');
                        });
                    }
                } catch (e) {
                    log(`reinstate check error: ${e.message}`);
                }
            } else if (res.statusCode === 403) {
                try {
                    const errObj = JSON.parse(resBody);
                    if (errObj && errObj.error === 'license_revoked') {
                    const reason = errObj.reason || 'This license was remotely revoked by the administrator.';
                        log(`[desktop] Remote revocation received for ${instanceId}: ${reason}`);
                        try {
                            const lic = require(path.join(RES_SERVER, 'shared', 'licence.js'));
                            lic.recordRevocation(reason, instanceId, BASE_DIR);
                        } catch (e) {
                            log(`failed to record revocation: ${e.message}`);
                        }
                        await pollLicence();
                        [dashboardWindow, displayWindow].forEach(w => {
                            if (w && !w.isDestroyed()) w.webContents.send('af:licence-revoked', { reason });
                        });
                    }
                } catch (e) {
                    log(`could not parse 403 response: ${e.message}`);
                }
            } else {
                log(`cloud push status ${res.statusCode}`);
            }
        });
    });
    req.on('error', () => {/* offline; retry next tick (hash stays stale) */});
    req.end(payload);
}

async function cloudSyncTick() {
    if (engineDown()) return;
    try {
        // Read current local config to know cloud base + instance identity.
        const cfgRes = await fetch(`http://localhost:${PORT}/api/config`);
        const cfg = await cfgRes.json();
        const instanceId = cfg && cfg.instanceId;
        const writerToken = cfg && cfg.cloudWriterToken;
        if (!instanceId || !writerToken) return; // identity not ready

        const localRes = await fetch(`http://localhost:${PORT}/api/data`);
        const localData = await localRes.json();

        const payload = JSON.stringify(localData);
        const hash = crypto.createHash('sha256').update(payload).digest('hex');

        let isCurrentlyRevoked = false;
        try {
            const lic = require(path.join(RES_SERVER, 'shared', 'licence.js'));
            isCurrentlyRevoked = !!lic.isRevoked(BASE_DIR);
        } catch (e) {}

        // No heartbeat writes when idle, UNLESS revoked: when revoked, continue
        // pinging Supabase so deleting the row in revoked_licenses immediately
        // unlocks the machine without requiring manual code entry.
        if (hash === lastPushedHash && !isCurrentlyRevoked) return;

        pushState(instanceId, writerToken, localData);
    } catch (e) { /* engine/config not ready */ }
}

// ---- Software update check (version.json hosted next to the site) ----
// The app fetches `${cloudBase}/version.json`, compares the "version" field
// against the installed app version, and surfaces a "download" link when a
// newer build exists. Manual check from the settings page, plus a one-shot
// background check shortly after boot that pushes af:update-available to the
// open windows. Offline / missing manifest degrades to "up to date", never to
// an error dialog.
const UPDATE_MANIFEST = PRODUCT.updateUrl;

function expectedInstallerName(version) {
    return `tdqsys-v2-setup-${version}.exe`;
}

function assertUpdateArtifactMatchesManifest(info) {
    let name;
    try { name = path.basename(new URL(info.url).pathname); } catch { throw new Error('update URL is invalid'); }
    const expected = expectedInstallerName(info.latest);
    if (name !== expected) {
        throw new Error(`update manifest is inconsistent: version ${info.latest} must use ${expected}, not ${name}`);
    }
}

async function checkForUpdates() {
    const current = app.getVersion();
    // Not operator-configurable and never restored from another product's backup.
    const manifestUrl = UPDATE_MANIFEST;
    try {
        const res = await fetch(manifestUrl, {
            signal: AbortSignal.timeout(10000),
            headers: { 'User-Agent': 'TDQSYS-Updater/1.0' }
        });
        if (!res.ok) {
            return { ok: true, current, latest: null, url: null, notes: null }; // 404 => no published manifest yet
        }
        const m = await res.json();
        return {ok:true,current,...validateManifest(m,current)};
    } catch {
        return { ok: false, reason: 'network', current, latest: null, url: null, notes: null };
    }
}

async function backgroundUpdateCheck() {
    const info = await checkForUpdates();
    if (info.updateAvailable) {
        // Notify every open local window; they render the update pill/banner.
        [dashboardWindow, displayWindow].forEach(w => {
            if (w && !w.isDestroyed()) w.webContents.send('af:update-available', info);
        });
    }
}

function buildTestDriveSettings(cfg) {
    return { action:'configure', models:(cfg.brands || []).flatMap(brand => (brand.models || []).map((model,index) => ({
        fullName:model.label, shortname:model.shortname || model.label.slice(0,36), brandKey:brand.key, unit:index+1
    }))), waiver:cfg.testDrive?.waiver ?? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    terms:cfg.testDrive?.terms ?? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', sheetsUrl:cfg.testDrive?.sheetsUrl || '',
    ...(Array.isArray(cfg.testDrive?.dealerships) ? {dealerships:cfg.testDrive.dealerships} : {}),
    ...(Array.isArray(cfg.testDrive?.giveawayItems) ? {giveawayItems:cfg.testDrive.giveawayItems} : {}),
    ...(Array.isArray(cfg.testDrive?.giveawayStockOpenings) ? {giveawayStockOpenings:cfg.testDrive.giveawayStockOpenings} : {}) };
}

// The app, rather than a particular renderer page, owns durable Sheets retries.
async function registrationSyncTick() {
    if (registrationSyncBusy || engineDown() || app.isQuitting) return;
    registrationSyncBusy = true;
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(BASE_DIR,'data.json'),'utf8')).config;
        registrationSyncStatus = {hasUrl:!!cfg.testDrive?.sheetsUrl};
        const licence = require(path.join(RES_SERVER,'shared','licence.js'));
        if (!licence.status(cfg.instanceId,{dataDir:BASE_DIR}).canWrite) return;
        const settings = buildTestDriveSettings(cfg);
        const hash = crypto.createHash('sha256').update(JSON.stringify([cfg.instanceId,settings])).digest('hex');
        const send = async body => {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/test-drive-operations`, {
                method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-TDQSYS-Instance':cfg.instanceId,'X-TDQSYS-Writer':cfg.cloudWriterToken},body:JSON.stringify(body)
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error || 'Registration sync unavailable.');
            return result;
        };
        if (hash !== registrationSettingsHash) { await send(settings); registrationSettingsHash = hash; }
        if (registrationSyncStatus.hasUrl) await send({action:'sync-sheets'});
    } catch { /* Keep registrations in the durable outbox and retry silently. */ }
    finally { registrationSyncBusy = false; }
}

function startCloudSync() {
    cloudTimer = setInterval(cloudSyncTick, 10000);
    cloudSyncTick();
    if (registrationTimer) clearInterval(registrationTimer);
    registrationTimer = setInterval(registrationSyncTick,15000);
    registrationSyncTick();
    if(localQueueTimer)clearInterval(localQueueTimer);
    localQueueTimer=setInterval(()=>localQueueTick(),1000);
    localQueueTick();
}

// ---- In-app automatic update ("hot update") ----
// The update button does NOT open a browser anymore. The app:
//  1. downloads the NSIS installer to %TEMP% (progress pushed to the caller),
//  2. verifies its size against the manifest,
//  3. stops engine/TTS + every child process (nothing survives to block the
//     file replace, so the NSIS close-check never has to complain),
//  4. runs the installer silently, hands a detached helper the job of waiting
//     for it and relaunching the freshly installed exe,
//  5. quits. From the operator's view it's just "download -> restart on the
//     new version".

function sendUpdateProgress(win, payload) {
    if (win && !win.isDestroyed()) win.webContents.send('af:update-progress', payload);
}

function downloadToFile(url, dest, onProgress, redirects=0) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        if(u.protocol!=='https:' || redirects>5)return reject(Error('Invalid update download redirect.'));
        const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET' }, (res) => {
            // GitHub release assets 302 to the CDN; follow redirects.
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                downloadToFile(new URL(res.headers.location,url).href, dest, onProgress,redirects+1).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`download failed (HTTP ${res.statusCode})`));
                return;
            }
            const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
            const out = fs.createWriteStream(dest);
            let received = 0;
            res.on('data', (chunk) => { received += chunk.length; onProgress(received, total); });
            res.on('error', (e) => { out.destroy(); reject(e); });
            res.pipe(out);
            out.on('error', (e) => { res.destroy(); reject(e); });
            out.on('close', () => resolve({ path: dest, size: received }));
        });
        req.on('error', reject);
        req.setTimeout(30000,()=>req.destroy(Error('Update download stalled. Please retry.')));
        req.end();
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function applyUpdate(info, win) {
    log(`applying update to v${info.latest} (${info.url})`);
    // Never label an old installer as a newer release. Apart from causing an
    // endless update prompt, it makes a failed handoff almost impossible to
    // diagnose because the binary reports a different version after restart.
    assertUpdateArtifactMatchesManifest(info);
    sendUpdateProgress(win, { state: 'download', percent: 0 });

    const dest = path.join(app.getPath('temp'), `tdqsys-v2-setup-${info.latest}.exe`);
    try { fs.unlinkSync(dest); } catch { /* first download */ }
    const result = await downloadToFile(info.url, dest, (received, total) => {
        const percent = total ? Math.min(99, Math.round(received / total * 100)) : 0;
        sendUpdateProgress(win, { state: 'download', percent, received, total });
    });
    const expected = parseInt(info.size || '0', 10);
    if (!expected || result.size !== expected || crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')!==info.sha256) {
        try { fs.unlinkSync(dest); } catch {}
        throw new Error('Update checksum or byte-size verification failed. Nothing was installed.');
    }
    log(`download complete: ${result.size} bytes`);

    // The new exe lands in the same install folder the uninstaller lives in.
    const installDir = path.dirname(UNINSTALLER_EXE);
    const newExe = path.join(installDir, PRODUCT.executable);

    // Stop every child so the installer can replace files without a struggle.
    app.isQuitting = true;
    cleanup();

    sendUpdateProgress(win, { state: 'installing', percent: 100 });

    // Detached helper that does the install AFTER this process is fully gone:
    // spawning the NSIS installer while TDQSYS is still alive makes it abort
    // silently (that's the failure that twice left the app closed, un-installed
    // and un-restarted).
    //
    // spawn(..., { detached: true }) is intentionally NOT used: on this Windows
    // box a detached PowerShell child exits immediately without executing. So
    // we write a .ps1 + a one-line .cmd and fire it via `cmd /c start`, which
    // orphans the PowerShell process so it survives our own exit.
    const tag = `TDQSYS-v2-update-${info.latest}`;
    const ps1 = path.join(app.getPath('temp'), `${tag}.ps1`);
    const cmdFile = path.join(app.getPath('temp'), `${tag}.cmd`);
    const updateLog = path.join(app.getPath('temp'), `${tag}.log`);
    try { fs.unlinkSync(updateLog); } catch {}
    // NSIS requires /D to be the final argument. Quote the directory because
    // Program Files is the normal all-users install location.
    const installerArgs = `/S /D="${installDir}"`;
    const psContent =
        `$log = '${updateLog}'; ` +
        `"start $(Get-Date -Format o)" | Set-Content $log; ` +
        `$deadline = (Get-Date).AddSeconds(180); $ready = $false; ` +
        `while ((Get-Date) -lt $deadline) { ` +
        `  $running = @(Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue); ` +
        `  if ($running.Count -eq 0) { $ready = $true; break }; ` +
        `  Start-Sleep -Milliseconds 400; ` +
        `}; ` +
        `"app exited: $ready" | Add-Content $log; ` +
        `if (-not $ready) { throw 'The v2 process did not exit. Update cancelled.' }; ` +
        // The app may have been launched from a terminal or a tool that set
        // this Electron-only switch. If inherited, TDQSYS.exe runs as Node
        // and exits without ever creating a window.
        `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; ` +
        `$ins = Start-Process -FilePath '${dest}' -ArgumentList '${installerArgs}' -Wait -PassThru; ` +
        `"installer exit: $($ins.ExitCode)" | Add-Content $log; ` +
        `if ($ins.ExitCode -ne 0) { throw "installer failed with exit code $($ins.ExitCode)" }; ` +
        `if (-not (Test-Path -LiteralPath '${newExe}')) { throw 'updated TDQSYS.exe was not found' }; ` +
        `$installed = (Get-Item -LiteralPath '${newExe}').VersionInfo.ProductVersion; ` +
        `if ((Get-Item -LiteralPath '${newExe}').VersionInfo.ProductName -ne '${PRODUCT_NAME}') { throw 'Installed product does not match v2' }; ` +
        `if ($installed -notin @('${info.latest}','${info.latest}.0')) { throw 'Installed version does not match the update' }; ` +
        `$launched = Start-Process -FilePath '${newExe}' -PassThru -ErrorAction Stop; ` +
        `"relaunched pid: $($launched.Id)" | Add-Content $log; ` +
        `Start-Sleep -Seconds 5; ` +
        `Remove-Item -LiteralPath '${dest}' -Force -ErrorAction SilentlyContinue; ` +
        `Remove-Item -LiteralPath '${ps1}','${cmdFile}' -Force -ErrorAction SilentlyContinue; ` +
        `"done $(Get-Date -Format o)" | Add-Content $log`;
    try { fs.writeFileSync(ps1, psContent, 'utf8'); } catch {}
    const cmdContent = `@echo off\r\nstart "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0${path.basename(ps1)}"`;
    try { fs.writeFileSync(cmdFile, cmdContent, 'utf8'); } catch {}

    // The helper is cmd.exe: present on Windows, absent everywhere else, and
    // spawn can also fail on Windows for permission reasons. Without an
    // 'error' listener that emitted event is unhandled and CRASHES the app.
    // We also must not quit on the way out if the helper never started, or the
    // operator loses the running app for an update that is not happening.
    let helperStarted = false;
    const helper = spawn('cmd.exe', ['/c', cmdFile], { detached: false, stdio: 'ignore', windowsHide: true });
    helper.on('error', (err) => {
        log(`update helper failed to start: ${err.message}`);
        sendUpdateProgress(win, { state: 'error', error: `Could not start the updater: ${err.message}` });
    });
    helper.once('spawn', () => { helperStarted = true; });
    helper.unref();

    setTimeout(() => { if (helperStarted) app.quit(); }, 250);
}

// ---- Firewall automation (best-effort, one-time per install) ----
// The engine (8081) and TTS (8001) listen on 0.0.0.0 (LAN/phone access), so
// Windows Firewall pops an "allow access" alert on first bind. The portable
// build extracts to a NEW temp path each run, so program-path rules would go
// stale immediately; port-based inbound allow rules are path-independent and
// cover both the installer and portable builds.
const FW_DONE = path.join(BASE_DIR, '.firewall-configured');
const FW_PENDING = path.join(BASE_DIR, '.firewall-pending');

function firewallMarkerOk() {
    try {
        return fs.existsSync(FW_DONE);
    } catch { return false; }
}

function writeFirewallScript() {
    const script = path.join(app.getPath('temp'), 'TDQSYS-v2-firewall.ps1');
    const esc = (s) => String(s).replace(/'/g, "''");
    const lines = [
        'function Add-Rule($name,$port) {',
        '  netsh advfirewall firewall delete rule name="$name" | Out-Null',
        '  $LASTEXITCODE = 0',
        '  netsh advfirewall firewall add rule name="$name" dir=in action=allow protocol=TCP localport=$port | Out-Null',
        '  return $LASTEXITCODE',
        '}',
        `$d = '${esc(FW_DONE)}'`,
        `$ok1 = Add-Rule "TDQSYS engine (TCP ${PORT})" ${PORT}`,
        `$ok2 = Add-Rule "TDQSYS tts (TCP ${TTS_PORT})" ${TTS_PORT}`,
        'if ($ok1 -eq 0 -and $ok2 -eq 0) {',
        '  New-Item -ItemType File -Force -Path $d | Out-Null',
        '}',
        'exit ($ok1 + $ok2)'
    ];
    fs.writeFileSync(script, lines.join('\r\n') + '\r\n', 'utf8');
    return script;
}

function runFirewallScript(elevated) {
    return new Promise((resolve) => {
        const script = writeFirewallScript();
        let args;
        if (elevated) {
            args = ['-NoProfile', '-Command',
                `Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${script}' -Verb RunAs -Wait`];
        } else {
            args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
        }
        const p = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        p.stdout.on('data', () => {});
        p.stderr.on('data', () => {});
        p.on('error', () => resolve(false));
        p.on('exit', () => resolve(firewallMarkerOk()));
    });
}

async function ensureFirewallRules() {
    if (!IS_INSTALLED) return;                       // dev: don't touch the firewall
    if (process.env.AF_SKIP_FIREWALL === '1') return; // automated testing
    if (firewallMarkerOk()) return;
    try { fs.mkdirSync(BASE_DIR, { recursive: true }); } catch {}
    if (fs.existsSync(FW_PENDING)) return;           // user declined once -> don't nag every launch

    // 1) Silent attempt (works when the app was started from an elevated shell).
    if (await runFirewallScript(false)) { log('firewall rules configured.'); return; }

    // 2) Otherwise one elevated attempt (single UAC prompt per install).
    try { fs.writeFileSync(FW_PENDING, 'pending', 'utf8'); } catch {}
    const ok = await runFirewallScript(true);
    if (ok) {
        try { fs.unlinkSync(FW_PENDING); } catch {}
        log('firewall rules configured (elevated).');
    } else {
        // Keep FW_PENDING so a declined/cancelled UAC is not re-attempted on
        // every launch; Windows then handles the allow alert on its own.
        log('firewall rules not configured after the elevated attempt.');
    }
}

// ---- Display handling (S1/S2 + HDMI yank) ----
function resolveDisplayTarget() {
    const displays = screen.getAllDisplays();
    // Prefer non-primary display (the TV via HDMI) when present.
    const external = displays.find(d => d.id !== screen.getPrimaryDisplay().id);
    return { displays, external };
}

function openDisplayWindow() {
    if (displayWindow && !displayWindow.isDestroyed()) return displayWindow;

    const { external } = resolveDisplayTarget();
    const cfg = getSettingsOverride();
    const mode = (cfg && cfg.displayMode) || displayMode;

    if (mode === 'preview' || !external) {
        // S1: no external monitor -> small preview window
        displayWindow = openLocalWindow({
            page: 'display_with_ads.html',
            width: 640, height: 400,
            fullscreen: false,
            minWidth: 300, minHeight: 200
        });
        displayWindow.on('close', () => { displayWindow = null; });
        return displayWindow;
    }

    // S2: external display present -> fullscreen on the TV
    const { workArea } = external;
    displayWindow = openLocalWindow({
        page: 'display_with_ads.html',
        x: workArea.x, y: workArea.y,
        width: workArea.width, height: workArea.height,
        fullscreen: true,
        minWidth: 300, minHeight: 200
    });
    displayWindow.on('close', () => { displayWindow = null; });
    return displayWindow;
}

function getSettingsOverride() {
    try {
        const p = path.join(BASE_DIR, 'data.json');
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p)).config || null;
    } catch { return null; }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
}

// First run: open the settings page (which auto-shows the setup wizard) until
// the operator completes the wizard; afterward the dashboard hub is the start
// page. "Persistent wizard" — settings still re-opens the wizard on every visit
// until the config is actually saved (wizardDone becomes true on save).
function wizardNotDone() {
    try {
        const p = path.join(BASE_DIR, 'data.json');
        if (!fs.existsSync(p)) return true;
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8')).config;
        return cfg && cfg.wizardDone !== true;
    } catch { return true; }
}

// Open (or reopen if closed) the dashboard window.
function openDashboardWindow() {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        if (dashboardWindow.isMinimized()) dashboardWindow.restore();
        dashboardWindow.show();
        dashboardWindow.focus();
        return dashboardWindow;
    }
    dashboardWindow = openLocalWindow({
        page: (FIRST_RUN || wizardNotDone()) ? 'settings.html' : 'index.html',
        width: 1200, height: 800,
        minWidth: 600, minHeight: 400
    });
    dashboardWindow.on('close', () => { dashboardWindow = null; });

    // A licence can lapse while the app is open, so re-check periodically and
    // let the title reflect it rather than letting saves fail silently.
    pollLicence();
    setInterval(pollLicence, 60000);

    dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Links that open "display in new window" -> manage through our own window
        if (url.includes('display')) {
            openDisplayWindow();
            return { action: 'deny' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });
    return dashboardWindow;
}

app.whenReady().then(() => {
    // Display added/removed handling must run only after app is ready.
    screen.on('display-added', () => {
        log('display added');
        if (displayMode === 'auto') openDisplayWindow();
    });
    screen.on('display-removed', () => {
        log('display removed (HDMI yanked?) — shrinking to small preview window');
        if (displayWindow && !displayWindow.isDestroyed()) {
            displayWindow.setFullScreen(false);
            displayWindow.setSize(640, 400);
            displayWindow.center();
        }
    });

    ensureFirewallRules();
    startEngine();
    startTTS();
    startCloudSync();

    // Registration area shortcut: dashboard on the local monitor, display on TV.
    openDashboardWindow();

    setTimeout(() => { if (displayMode === 'auto') openDisplayWindow(); }, 6000); // after engine boots

    // Update check: once the engine+config are up, look for a newer build and
    // push af:update-available to any open window if one exists. Then keep
    // re-checking: a version published while the app is already running used
    // to go unnoticed until the next manual restart, which left people stuck
    // on an old build wondering why the update pill never appeared.
    setTimeout(backgroundUpdateCheck, 15000);
    updatePollTimer = setInterval(backgroundUpdateCheck, 30 * 60 * 1000);

    tray = new Tray(path.join(APP_DIR, 'icon.png'));
    tray.setToolTip('TDQSYS');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Dashboard', click: () => openDashboardWindow() },
        { label: 'Open TV Display', click: () => openDisplayWindow() },
        { type: 'separator' },
        { label: 'Restart', click: () => restartSystem() },
        { type: 'separator' },
        { label: 'Quit TDQSYS', click: () => { app.isQuitting = true; app.quit(); } }
    ]));

    app.on('before-quit', () => { app.isQuitting = true; cleanup(); });
});

function restartSystem() {
    log('restarting engine + TTS + windows...');
    if (cloudTimer) clearInterval(cloudTimer);
    stopOwnedProcessTree(engineProcess); // exit handler auto-restarts in 2s
    stopOwnedProcessTree(ttsProcess);    // exit handler auto-restarts in 3s
    startCloudSync();
    // Reload open windows so they reconnect once the engine is back up.
    setTimeout(() => {
        [dashboardWindow, displayWindow].forEach(w => {
            if (w && !w.isDestroyed()) w.webContents.reload();
        });
    }, 6000);
}

function stopOwnedProcessTree(child) {
    if (!child || !Number.isInteger(child.pid) || child.pid <= 0 || child.exitCode !== null) return;
    if (process.platform === 'win32') {
        // PyInstaller --onefile has a launcher AND a worker. Terminating the
        // launcher first orphans its worker before taskkill can discover it.
        // Keep the root alive until Windows has enumerated/killed the tree.
        try {
            execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
                stdio:'ignore', windowsHide:true, timeout:10000
            });
        } catch (error) { log(`process tree ${child.pid} stop failed: ${error.message}`); }
    } else {
        try { child.kill(); } catch (error) { log(`process ${child.pid} stop failed: ${error.message}`); }
    }
}

function cleanup() {
    registrationSimulator?.stop();
    if (cloudTimer) clearInterval(cloudTimer);
    if (registrationTimer) clearInterval(registrationTimer);
    if (updatePollTimer) clearInterval(updatePollTimer);

    // Stop whole owned trees synchronously BEFORE exiting or clearing cache.
    [engineProcess, ttsProcess].forEach(stopOwnedProcessTree);
    // Never kill a port owner: it may belong to v1 or another application.

    // Item 5 — "auto clear rendered audio clips": wipe the generated cache on
    // every program shutdown (packaged only; dev keeps its cache warm). The
    // bundle seed re-fills numbers 01-50 at the next launch and the TTS
    // re-renders whatever exceeds the seed in the background.
    if (IS_INSTALLED) {
        try {
            if (fs.existsSync(path.join(BASE_DIR, 'audio_cache'))) {
                fs.rmSync(path.join(BASE_DIR, 'audio_cache'), { recursive: true, force: true });
                log('cleared rendered audio cache.');
            }
        } catch (e) { log(`audio cache clear skipped: ${e.message}`); }
    }
}

async function queueTicketSpeech(kind, model, number) {
    try {
        const response=await fetch(`http://127.0.0.1:${TTS_PORT}/api/play-ticket`,{
            method:'POST',signal:AbortSignal.timeout(2000),headers:{'Content-Type':'application/json','X-TDQSYS-Playback':TTS_PLAYBACK_TOKEN},
            body:JSON.stringify({kind,brandKey:model.brand_key,unit:model.unit_index,number})
        });
        if(!response.ok)throw Error('Speech service is not ready. Use Call Back to retry the announcement.');
        const speech=await response.json();
        return {speechQueued:!!speech.queued,speechPreparing:!speech.cacheReady};
    } catch(error) {return {speechQueued:false,speechError:error.message};}
}

let localQueueTimer=null;
let localQueueOwner=null;
let displayProjection=null;
let localActionChain=Promise.resolve();
function localConfig() {return JSON.parse(fs.readFileSync(path.join(BASE_DIR,'data.json'),'utf8')).config;}
let registrationSimulator=null;
function getRegistrationSimulator(){
    if(registrationSimulator)return registrationSimulator;
    const {RegistrationSimulator}=require(path.join(RES_SERVER,'shared','registration-simulator.js'));
    const statusFile=path.join(BASE_DIR,'registration-simulation-status.json');let restored=null;
    try{if(fs.existsSync(statusFile))restored=JSON.parse(fs.readFileSync(statusFile,'utf8'));}catch{/* Status only; registrations remain in the database. */}
    registrationSimulator=new RegistrationSimulator({getConfig:localConfig,restored,
        allowed:cfg=>{if(app.isQuitting || !require(path.join(RES_SERVER,'shared','licence.js')).status(cfg.instanceId,{dataDir:BASE_DIR}).canWrite)throw Error('This installation is not licensed for testing changes.');},
        persist:status=>{try{fs.writeFileSync(statusFile+'.tmp',JSON.stringify(status),{mode:0o600});fs.renameSync(statusFile+'.tmp',statusFile);}catch{console.warn('Could not save simulation status. Check tables before restarting.');}},
        remote:async(body,instanceId)=>{const cfg=localConfig();if(cfg.instanceId!==instanceId)throw Error('Simulation location changed.');const queue=getLocalQueue(cfg);await queue.barrier();try{return await remoteQueueOperation(body.action==='configure'?buildTestDriveSettings(cfg):body,instanceId);}finally{try{await queue.sync({force:true});}finally{queue.remoteBusy=false;}}},
        request:async(cfg,route,body,key)=>{
            const base=cfg.cloudBase.replace(/\/+$/,''),url=route==='config'?`${base}/api/test-drive/config?id=${encodeURIComponent(cfg.instanceId)}`:`${base}/api/test-drive/${route}`;
            const response=await fetch(url,{signal:AbortSignal.timeout(30000),...(body?{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)}:{})});
            const result=await response.json();if(!response.ok)throw Error((result.fields?Object.values(result.fields).join(' '):result.error)||'Test registration failed; verify tables before restarting.');return result;
        }});
    return registrationSimulator;
}
async function remoteQueueOperation(body,expectedInstanceId) {
    const cfg=localConfig();
    if(expectedInstanceId && cfg.instanceId!==expectedInstanceId)throw Object.assign(Error('Installation identity changed; local actions have been retained for review.'),{status:409});
    const response=await fetch(`${SUPABASE_URL}/functions/v1/test-drive-operations`,{
        method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-TDQSYS-Instance':cfg.instanceId,'X-TDQSYS-Writer':cfg.cloudWriterToken},body:JSON.stringify(body)
    });
    const result=await response.json();
    if(!response.ok)throw Object.assign(Error(result.error || `Queue service returned ${response.status}.`),{status:response.status});
    return result;
}
function getLocalQueue(cfg) {
    if(!localQueueOwner || localQueueOwner.state.instanceId!==cfg.instanceId) {
        const {LocalTestDrive}=require(path.join(RES_SERVER,'shared','test-drive-local.js'));
        localQueueOwner=new LocalTestDrive({directory:BASE_DIR,instanceId:cfg.instanceId,remote:body=>remoteQueueOperation(body,cfg.instanceId)});
    }
    return localQueueOwner;
}
async function applyLocalDisplay(queue) {
    queue.prepareDisplayProjection();
    while(queue.state.displayPending.length) {
        if(displayProjection){await displayProjection;continue;}
        const items=structuredClone(queue.state.displayPending);
        displayProjection=(async()=>{
            const cfg=localConfig();
            const response=await fetch(`http://localhost:${PORT}/api/data`);
            if(!response.ok)throw Error('Local display is unavailable; the queue action remains saved.');
            const state=await response.json();
            for(const item of items) {
                const model=(cfg.brands || []).find(brand=>brand.key===item.brandKey)?.models?.[item.unit-1];
                if(model?.label!==item.fullName || !state.queues[item.brandKey] || !(String(item.unit) in state.queues[item.brandKey]))throw Error('Vehicle display mapping changed. Review Settings before continuing.');
                state.queues[item.brandKey][item.unit]=item.number;
            }
            const saved=await fetch(`http://localhost:${PORT}/api/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});
            if(!saved.ok)throw Error('Local display update failed; the queue action remains saved for recovery.');
            queue.markDisplayApplied(items);cloudSyncTick();
        })();
        try {await displayProjection;}finally{displayProjection=null;}
    }
}
function dispatchLocalQueueAction(request,cfg) {
    const work=localActionChain.catch(()=>{}).then(()=>localQueueAction(request,cfg));
    localActionChain=work;return work;
}
async function localQueueTick(force=false) {
    if(engineDown() || app.isQuitting)return;
    try {
        const cfg=localConfig(),queue=getLocalQueue(cfg);
        if(queue.remoteBusy)return;
        const canWrite=require(path.join(RES_SERVER,'shared','licence.js')).status(cfg.instanceId,{dataDir:BASE_DIR}).canWrite;
        if(queue.state.outbox.length && !canWrite)return;
        const before=JSON.stringify([queue.state.lastSyncedAt,queue.state.outbox,queue.lastError,queue.state.snapshot?.models]);
        // Project midnight/local actions first, even offline. A stale vehicle
        // mapping must not prevent fetching the snapshot that can repair it.
        if(canWrite)try {await applyLocalDisplay(queue);} catch { /* Retry after synchronization; retain the durable projection. */ }
        await queue.sync({force});
        if(canWrite)try {await applyLocalDisplay(queue);} catch(error) {queue.lastError=error.message;}
        if(before!==JSON.stringify([queue.state.lastSyncedAt,queue.state.outbox,queue.lastError,queue.state.snapshot?.models]))notifyLocalQueueChanged();
    }catch(error){if(localQueueOwner)localQueueOwner.lastError=error.message;}
}
function notifyLocalQueueChanged() {
    for(const win of BrowserWindow.getAllWindows()) {
        if(win.isDestroyed())continue;
        try {
            const url=new URL(win.webContents.getURL());
            if(url.origin===`http://localhost:${PORT}` && ['/dashboard.html','/dashboard-brand2.html','/master-table.html','/print-queue.html','/sales-executives.html','/giveaways.html','/event-setup.html'].includes(url.pathname))win.webContents.send('af:local-queue-changed');
        }catch{}
    }
}
function decorateLocalSnapshot(snapshot,cfg) {
    const firstCount=(cfg.brands || []).find(brand=>brand.key==='brand1')?.models?.length || 0;
    snapshot.brands=(cfg.brands || []).filter(brand=>brand.models?.length && (brand.key!=='brand2' || firstCount<12)).map(brand=>({key:brand.key,name:brand.name,color:brand.color}));
    for(const model of snapshot.models || [])model.display_prefix=(cfg.brands || []).find(brand=>brand.key===model.brand_key)?.models?.[model.unit_index-1]?.prefix || '';
    snapshot.sheetsStatus={...registrationSyncStatus,hasUrl:!!cfg.testDrive?.sheetsUrl};
    const base=(cfg.cloudBase || 'https://tdqsys.pages.dev').replace(/\/+$/,'');
    snapshot.registrationLinks={client:`${base}/test-drive-registration.html?id=${encodeURIComponent(cfg.instanceId)}`,se:`${base}/se-registration.html?id=${encodeURIComponent(cfg.instanceId)}`};
    snapshot.mirrorLink=/^https?:\/\//i.test(cfg.cloudBase || '') ? `${base}/client.html?id=${encodeURIComponent(cfg.instanceId)}` : '';
    return snapshot;
}
async function localQueueAction(request,cfg) {
    const queue=getLocalQueue(cfg);
    if(request.action==='snapshot') {
        queue.setOptions(request);
        if(request.requireFresh) {
            await localQueueTick(true);
            if(queue.lastError || !queue.status().ready)throw Error('Cannot prepare the full cloud history export. Retry when connected, or export local queue recovery.');
        } else setTimeout(()=>localQueueTick(!!request.refreshCloud),0);
        return {ok:true,...decorateLocalSnapshot(queue.view(),cfg)};
    }
    if(request.action==='export-local-queue')return {ok:true,recovery:structuredClone(queue.state)};
    if(request.action==='retry-local-sync') {
        const result=queue.retryBlocked();setTimeout(()=>localQueueTick(true),0);
        return {ok:true,...result,localSnapshot:decorateLocalSnapshot(queue.view(),cfg)};
    }
    if(request.action==='archive-local-conflicts') {
        const result=queue.archiveEarlierRun(request.confirm);setTimeout(()=>localQueueTick(true),0);
        return {ok:true,...result,localSnapshot:decorateLocalSnapshot(queue.view(),cfg)};
    }
    const ticket=queue.ticket(request.entryId);
    const configured=(cfg.brands || []).find(brand=>brand.key===ticket.model.brand_key)?.models?.[ticket.model.unit_index-1];
    if(configured?.label!==ticket.model.full_name)throw Error('Vehicle configuration changed. Wait for Settings synchronization before calling this client.');
    let result={entry:ticket.entry,model:ticket.model};
    if(request.action!=='callback')result=queue.commit(request);
    if(request.action==='ongoing')await applyLocalDisplay(queue);
    if(['ongoing','callback'].includes(request.action))Object.assign(result,await queueTicketSpeech(request.action,ticket.model,ticket.entry.queue_number));
    setTimeout(()=>localQueueTick(),0);
    notifyLocalQueueChanged();
    return {ok:true,...result,localSaved:request.action!=='callback',localSnapshot:decorateLocalSnapshot(queue.view(),cfg)};
}

function formatClientLabel(label, config) {
    if(label.kind!=='client_ticket')return label;
    const model=(config.brands||[]).find(brand=>brand.key===label.brandKey)?.models?.[label.unit-1];
    if(!model || !Number.isInteger(label.queueNumber) || label.queueNumber<1) throw Error('Vehicle label mapping changed. Sync Settings before printing.');
    return {...label,value:(model.prefix||'')+String(label.queueNumber).padStart(2,'0')};
}

function buildPrintLabelHtml(label,formatting) {
    const layout=require(path.join(RES_SERVER,'public','print-label.js'));
    const format=layout.normalize(formatting)[label.kind==='se_code_slip'?'agent':'client'],fontData={};
    for(const name of new Set([format.header.fontFamily,format.number.fontFamily]))if(layout.bundledFonts[name]) {
        fontData[name]='data:font/ttf;base64,'+fs.readFileSync(path.join(RES_SERVER,'public','fonts',layout.bundledFonts[name])).toString('base64');
    }
    return layout.buildHtml(label,formatting,fontData);
}

const fitPrintLabel=require(path.join(RES_SERVER,'public','print-label.js')).fit;

let historyCleanupOwner;
function getHistoryCleanup(cfg) {
    if(historyCleanupOwner)return historyCleanupOwner;
    const {HistoryCleanup}=require(path.join(RES_SERVER,'shared','history-cleanup.js'));
    const queue=getLocalQueue(cfg);
    const remote=async body=>{
        const response=await fetch(`${SUPABASE_URL}/functions/v1/test-drive-operations`,{method:'POST',signal:AbortSignal.timeout(30000),
            headers:{'Content-Type':'application/json','X-TDQSYS-Instance':cfg.instanceId,'X-TDQSYS-Writer':cfg.cloudWriterToken},body:JSON.stringify(body)});
        const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error || 'History service unavailable.'),{status:response.status});return result;
    };
    historyCleanupOwner=new HistoryCleanup({queue,remote,
        chooseFile:async()=>{const result=await dialog.showSaveDialog({title:'Save private TDQSYS history backup before cleanup',defaultPath:path.join(app.getPath('documents'),`tdqsys-before-cleanup-${Date.now()}.json`),filters:[{name:'TDQSYS history backup',extensions:['json']}]});return result.canceled?null:result.filePath;},
        readLocal:()=>JSON.parse(fs.readFileSync(path.join(BASE_DIR,'data.json'),'utf8')),
        reconcile:async result=>{
            const fresh=await remote({action:'snapshot',...queue.options});
            const deleted=new Set(result.deletedRunIds || []),next=structuredClone(queue.state);
            next.snapshot=null;next.displayPending=[];next.displayContext=null;
            next.archives=result.mode==='clean'?[]:(next.archives || []).map(archive=>({...archive,operations:archive.operations.filter(operation=>!deleted.has(operation.runId))})).filter(archive=>archive.operations.length);
            next.outbox=next.outbox.filter(operation=>!deleted.has(operation.runId));queue.save(next);
            queue.acceptSnapshot(fresh,queue.options);queue.prepareDisplayProjection();await applyLocalDisplay(queue);cloudSyncTick();notifyLocalQueueChanged();
        }});
    return historyCleanupOwner;
}
// IPC for settings page (native dialogs / file ops live here, not in browser JS).
ipcMain.handle('af:testDrive', async (event, request) => {
    try {
        const sender = new URL(event.senderFrame.url);
        const settingsActions = ['integration-info', 'test-sheets', 'speech-preview', 'speech-status', 'giveaway-inventory', 'giveaway-stock', 'giveaway-correct', 'giveaway-correction-history', 'simulation-start', 'simulation-status', 'simulation-stop'];
        const allowedPage = ['/dashboard.html','/dashboard-brand2.html','/master-table.html','/print-queue.html','/sales-executives.html','/giveaways.html','/live-dashboard.html','/event-setup.html','/test-drive-operations.html'].includes(sender.pathname)
            || (sender.pathname === '/settings.html' && settingsActions.includes(request?.action));
        if (sender.origin !== new URL(`http://localhost:${PORT}`).origin || !allowedPage) {
            throw new Error('Open Test Drive Operations inside TDQSYS.');
        }
        const actions = ['snapshot', 'ongoing', 'status', 'reset', 'reset-sales-executives', 'reprint-se-code', 'configure', 'printers', 'claim-print', 'print-result', 'cancel-print', 'print', 'reissue', 'sync-sheets', 'callback', 'export-local-queue', 'archive-local-conflicts', 'retry-local-sync', 'giveaway-snapshot', 'set-giveaway', 'issue-giveaways', 'dashboard-snapshot', ...settingsActions];
        if(sender.pathname==='/event-setup.html')actions.push('history-list','history-preview','history-backup','history-delete','history-resume');
        if (!request || !actions.includes(request.action)) throw new Error('Unsupported operation.');
        if(request.action.startsWith('simulation-')){
            if(sender.pathname!=='/settings.html')throw Error('Open the simulation controls in desktop Settings.');
            const simulator=getRegistrationSimulator();
            return {ok:true,simulation:request.action==='simulation-start'?simulator.start(request):request.action==='simulation-stop'?simulator.stop():simulator.status()};
        }
        if(request.action==='speech-status') {
            const response=await fetch(`http://127.0.0.1:${TTS_PORT}/api/speech-status`,{
                signal:AbortSignal.timeout(2000),headers:{'X-TDQSYS-Playback':TTS_PLAYBACK_TOKEN}
            });
            if(!response.ok)throw Error('Local speech preparation status is unavailable.');
            return {ok:true,...await response.json()};
        }
        if(request.action==='speech-preview') {
            const preview=await fetch(`http://127.0.0.1:${TTS_PORT}/api/preview-ticket`,{
                method:'POST',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','X-TDQSYS-Playback':TTS_PLAYBACK_TOKEN},
                body:JSON.stringify(request.preview)
            });
            if(!preview.ok)throw Error(await preview.text() || 'Local speech preview is unavailable.');
            return {ok:true,audioBase64:Buffer.from(await preview.arrayBuffer()).toString('base64'),voice:preview.headers.get('X-TDQSYS-Voice')};
        }
        const state = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'data.json'), 'utf8'));
        const cfg = state.config || {};
        if (request.action === 'printers') {
            return { ok: true, printers: await event.sender.getPrintersAsync() };
        }
        if (request.action === 'configure') {
            request = buildTestDriveSettings(cfg);
        }
        if (!['snapshot', 'integration-info','export-local-queue','giveaway-snapshot','giveaway-inventory','dashboard-snapshot','giveaway-correction-history'].includes(request.action)) {
            const licence = require(path.join(RES_SERVER, 'shared', 'licence.js'));
            if (!licence.status(cfg.instanceId, { dataDir: BASE_DIR }).canWrite) throw new Error('This licence does not allow changes.');
        }
        if(request.action.startsWith('history-'))return await getHistoryCleanup(cfg).handle(request);
        if(['ongoing','status','callback'].includes(request.action))return await dispatchLocalQueueAction(request,cfg);
        if(['snapshot','export-local-queue','archive-local-conflicts','retry-local-sync'].includes(request.action))return await localQueueAction(request,cfg);
        let printerName;
        if (request.action === 'print' || (request.action==='reissue' && request.printNow===true)) {
            const printers = await event.sender.getPrintersAsync();
            if (!printers.some(printer => printer.name === request.printerName)) throw new Error('Select an installed label printer first.');
            printerName = request.printerName;
            if(request.action==='print') request = { action: 'claim-print', jobId: request.jobId };
        }
        const queue=getLocalQueue(cfg);
        const guarded=['configure','reissue','reset','print-result','claim-print','cancel-print','reprint-se-code','reset-sales-executives'].includes(request.action);
        if(guarded)await queue.barrier();
        try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/test-drive-operations`, {
            method: 'POST', signal: AbortSignal.timeout(15000),
            headers: { 'Content-Type': 'application/json', 'X-TDQSYS-Instance': cfg.instanceId, 'X-TDQSYS-Writer': cfg.cloudWriterToken },
            body: JSON.stringify(request)
        });
        let result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.error || `Queue service returned ${response.status}.`),{status:response.status});
        let issuedTicket;
        if(printerName && request.action==='reissue') {
            issuedTicket=result;
            const claimed=await fetch(`${SUPABASE_URL}/functions/v1/test-drive-operations`,{
                method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-TDQSYS-Instance':cfg.instanceId,'X-TDQSYS-Writer':cfg.cloudWriterToken},
                body:JSON.stringify({action:'claim-print',jobId:issuedTicket.jobId})
            });
            result=await claimed.json();
            if(!claimed.ok)throw Error(`Ticket ${issuedTicket.queueNumber} is saved. ${result.error || 'Print claim failed.'} Check Print Queue before retrying.`);
            request={...request,jobId:issuedTicket.jobId};
        }
        if (printerName) {
            const label = result.label;
            const printWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
            let printError;
            try {
                const html = buildPrintLabelHtml(formatClientLabel(label,cfg),cfg.ticketPrinting);
                await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
                await printWindow.webContents.executeJavaScript(`document.fonts.ready.then(()=>(${fitPrintLabel.toString()})())`);
                await new Promise((resolve, reject) => printWindow.webContents.print({ silent: true, deviceName: printerName,
                    pageSize: { width: 50000, height: 30000 }, margins: { marginType: 'none' }, printBackground: true },
                    (success, reason) => success ? resolve() : reject(new Error(reason || 'Printer did not accept the label.'))));
            } catch (error) { printError = error.message; }
            finally { printWindow.destroy(); }
            const recorded = await fetch(`${SUPABASE_URL}/functions/v1/test-drive-operations`, {
                method: 'POST', signal: AbortSignal.timeout(15000),
                headers: { 'Content-Type':'application/json', 'X-TDQSYS-Instance':cfg.instanceId, 'X-TDQSYS-Writer':cfg.cloudWriterToken },
                body: JSON.stringify({ action:'print-result', jobId:request.jobId, status:printError ? 'failed' : 'printed', error:printError })
            });
            if (!recorded.ok) throw new Error('Printer result could not be saved. Check the physical label before retrying this claimed job.');
            if (printError) throw new Error(`${printError} Ticket is saved; retry its failed job in Print Queue.`);
            return { ok: true, printed: true, issuedTicket };
        }
        if (request.action === 'reset') {
            const localResponse = await fetch(`http://localhost:${PORT}/api/data`);
            if (!localResponse.ok) throw new Error('Cannot update the local display.');
            const local = await localResponse.json();
            if (request.action === 'reset') {
                for (const slots of Object.values(local.queues)) for (const unit of Object.keys(slots)) slots[unit] = 0;
                local.reannounce = null;
            }
            const saved = await fetch(`http://localhost:${PORT}/api/save`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(local)
            });
            if (!saved.ok) throw new Error('Queue action saved in the cloud; local display update failed. Retry Ongoing to reconcile it.');
            cloudSyncTick();
        }
        if (request.action === 'snapshot') {
            const firstBrandCount = (cfg.brands || []).find(brand => brand.key === 'brand1')?.models?.length || 0;
            result.brands = (cfg.brands || []).filter(brand => brand.models?.length && (brand.key !== 'brand2' || firstBrandCount < 12))
                .map(brand => ({key:brand.key,name:brand.name,color:brand.color}));
            for (const model of result.models || []) {
                model.display_prefix = (cfg.brands || []).find(brand => brand.key === model.brand_key)?.models?.[model.unit_index-1]?.prefix || '';
            }
            result.sheetsStatus = {...registrationSyncStatus,hasUrl:!!cfg.testDrive?.sheetsUrl};
        }
        const publicBase = cfg.cloudBase || 'https://tdqsys.pages.dev';
        return { ok: true, ...result, mirrorLink:/^https?:\/\//i.test(cfg.cloudBase || '') ? `${cfg.cloudBase.replace(/\/+$/, '')}/client.html?id=${encodeURIComponent(cfg.instanceId)}` : '', registrationLinks: {
            client: `${publicBase.replace(/\/+$/, '')}/test-drive-registration.html?id=${encodeURIComponent(cfg.instanceId)}`,
            se: `${publicBase.replace(/\/+$/, '')}/se-registration.html?id=${encodeURIComponent(cfg.instanceId)}`
        } };
        } finally {
            if(guarded) {try {await queue.sync({force:true});}finally{queue.remoteBusy=false;}}
        }
    } catch (error) {
        return { ok: false, error: error.message || 'Queue service is unavailable.', ...(error.status?{status:error.status}:{}),...(error.cleanupUnconfirmed?{cleanupUnconfirmed:true}:{}) };
    }
});

ipcMain.handle('af:chooseVideos', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [ { name: 'Video', extensions: ['mp4', 'webm'] } ] });
    if (r.canceled || !r.filePaths.length) return { ok: false };
    const copied = [];
    for (const src of r.filePaths) {
        try {
            const name = path.basename(src);
            const dest = path.join(BASE_DIR, 'videos', name);
            fs.copyFileSync(src, dest);
            copied.push(name);
        } catch { /* ignore */ }
    }
    return { ok: copied.length > 0, files: copied };
});

ipcMain.handle('af:dataDir', () => BASE_DIR);
ipcMain.handle('af:displayMode', (_e, mode) => { displayMode = mode; });

// Software updates: renderer-triggered check; in-app auto-update (download ->
// silent install -> restart, no browser). openExternal stays for misc links.
ipcMain.handle('af:checkUpdates', () => checkForUpdates());
ipcMain.handle('af:licenceChanged', async () => { await pollLicence(); });
ipcMain.handle('af:openExternal', (_e, url) => { if (url) shell.openExternal(url); });
ipcMain.handle('af:installUpdate', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
        const info = await checkForUpdates();
        if (!info || !info.updateAvailable || !info.url) return { ok: false, reason: 'no-update' };
        if (!UNINSTALLER_EXE) {
            // Portable builds have no fixed install folder to relaunch, so they
            // keep the old browser-download behaviour.
            if (info.url) shell.openExternal(info.url);
            return { ok: false, reason: 'portable' };
        }
        await applyUpdate(info, win);
        return { ok: true };
    } catch (e) {
        if (win && !win.isDestroyed()) win.webContents.send('af:update-progress', { state: 'error', error: e.message });
        return { ok: false, reason: 'error', error: e.message };
    }
});

// ---- App info: mode (installed / portable / dev), data dir, uninstaller ----
ipcMain.handle('af:appInfo', () => {
    let videoCount = 0;
    try {
        const vdir = path.join(BASE_DIR, 'videos');
        if (fs.existsSync(vdir)) {
            videoCount = fs.readdirSync(vdir).filter(f => /\.(mp4|webm)$/i.test(f)).length;
        }
    } catch { /* data dir may not exist yet on first run */ }
    return {
        mode: app.isPackaged ? (UNINSTALLER_EXE ? 'installed' : 'portable') : 'dev',
        version: app.getVersion(),
        dataDir: BASE_DIR,
        uninstaller: UNINSTALLER_EXE,
        firstRun: FIRST_RUN,
        // TRUE when data.json already existed at launch — i.e. a previous
        // install's data survived on disk. Since uninstall now wipes the data
        // folder and reinstall starts generic, this is informational only; the
        // backup file is the single supported way to restore queue state.
        dataRestored: !FIRST_RUN,
        videoCount
    };
});

// ---- PowerShell helper (Windows-only; Compress-Archive/Expand-Archive) ----
// The packaged app carries no node_modules, so we lean on the OS PowerShell
// that already ships with Windows (same dependency the firewall setup uses).
function runPowershell(script) {
    return new Promise((resolve) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
            { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
        let err = '';
        p.stderr.on('data', d => { err += d.toString(); });
        p.on('error', (e) => resolve({ code: -1, error: `powershell launch failed: ${e.message}` }));
        p.on('exit', (code) => resolve({ code: code == null ? -1 : code, error: err.trim() }));
    });
}
const pshQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ---- Backup: zip data.json + videos/ into a user-chosen .zip (no web page can reach this) ----
ipcMain.handle('af:backupData', async () => {
    try {
        const stamp = new Date().toISOString().slice(0, 10);
        const r = await dialog.showSaveDialog({
            title: 'Backup TDQSYS data',
            defaultPath: path.join(app.getPath('documents'), `TDQSYS-backup-${stamp}.zip`),
            filters: [{ name: 'TDQSYS Backup', extensions: ['zip'] }]
        });
        if (r.canceled || !r.filePath) return { ok: false, canceled: true };

        // Stage a copy of the live data (atomic against the engine's own writes).
        const stage = fs.mkdtempSync(path.join(app.getPath('temp'), 'TDQSYS-bak-'));
        try {
            let items = 0;
            fs.mkdirSync(path.join(stage, 'videos'), { recursive: true });
            const dataFile = path.join(BASE_DIR, 'data.json');
            if (fs.existsSync(dataFile)) { fs.copyFileSync(dataFile, path.join(stage, 'data.json')); items++; }
            const localQueueFile=getLocalQueue(localConfig()).file;
            if(fs.existsSync(localQueueFile)){fs.copyFileSync(localQueueFile,path.join(stage,'test-drive-local-recovery.json'));items++;}
            const vdir = path.join(BASE_DIR, 'videos');
            if (fs.existsSync(vdir)) {
                for (const f of fs.readdirSync(vdir)) {
                    if (/\.(mp4|webm)$/i.test(f)) {
                        fs.copyFileSync(path.join(vdir, f), path.join(stage, 'videos', f));
                        items++;
                    }
                }
            }
            if (items === 0) {
                fs.rmSync(stage, { recursive: true, force: true });
                return { ok: false, reason: 'no-data' };
            }
            const out = await runPowershell(
                `Compress-Archive -Path ${pshQuote(path.join(stage, '*'))} -DestinationPath ${pshQuote(r.filePath)} -Force`);
            fs.rmSync(stage, { recursive: true, force: true });
            if (out.code !== 0) return { ok: false, reason: 'zip-failed', error: out.error || 'zip failed' };
            return { ok: true, file: r.filePath, items };
        } catch (e) {
            fs.rmSync(stage, { recursive: true, force: true });
            return { ok: false, reason: 'error', error: e.message };
        }
    } catch (e) {
        return { ok: false, reason: 'error', error: e.message };
    }
});

// ---- Restore: unpack a backup .zip over the current data dir, then reload engine ----
ipcMain.handle('af:restoreData', async () => {
    let restoreStage;
    try {
        const r = await dialog.showOpenDialog({
            title: 'Restore TDQSYS data from a backup',
            properties: ['openFile'],
            filters: [{ name: 'TDQSYS Backup', extensions: ['zip'] }]
        });
        if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
        const zip = r.filePaths[0];

        const stage = fs.mkdtempSync(path.join(app.getPath('temp'), 'TDQSYS-rst-'));
        restoreStage = stage;
        const out = await runPowershell(
            `Expand-Archive -LiteralPath ${pshQuote(zip)} -DestinationPath ${pshQuote(stage)} -Force`);
        if (out.code !== 0) {
            fs.rmSync(stage, { recursive: true, force: true });
            return { ok: false, reason: 'expand-failed', error: out.error || 'could not open zip' };
        }

        // Find data.json anywhere in the archive and sanity-check its shape.
        let dataFile = null;
        const walk = (dir) => {
            for (const f of fs.readdirSync(dir)) {
                const p = path.join(dir, f);
                const st = fs.statSync(p);
                if (st.isDirectory()) { walk(p); continue; }
                if (f === 'data.json' && !dataFile) dataFile = p;
            }
        };
        try { walk(stage); } catch { dataFile = null; }
        if (!dataFile) {
            fs.rmSync(stage, { recursive: true, force: true });
            return { ok: false, reason: 'not-a-backup' };
        }
        let parsed;
        try { parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
        catch {
            fs.rmSync(stage, { recursive: true, force: true });
            return { ok: false, reason: 'bad-data-json' };
        }
        if (!parsed || !parsed.config || !parsed.queues) {
            fs.rmSync(stage, { recursive: true, force: true });
            return { ok: false, reason: 'bad-shape' };
        }

        const destinationResponse = await fetch(`http://localhost:${PORT}/api/config`);
        if (!destinationResponse.ok) throw new Error('Cannot verify the destination installation identity.');
        const destination = await destinationResponse.json();
        const sourceId = parsed.config.instanceId || '(not recorded)';
        const different = sourceId !== destination.instanceId;
        const confirmation = await dialog.showMessageBox({
            type:different ? 'warning' : 'question', title:'Confirm backup restore',
            message:different ? 'This backup was created by another installation.' : 'Restore this backup?',
            detail:`Backup Instance ID: ${sourceId}\nThis PC's Instance ID: ${destination.instanceId}\n\nThis PC keeps its identity, licence binding, and cloud credentials. Queue configuration, numbers, and videos are restored. A safety copy of the current queue state will be retained.`,
            buttons:['Cancel','Restore and keep this PC identity'], defaultId:0, cancelId:0
        });
        if (confirmation.response !== 1) {
            fs.rmSync(stage, { recursive:true, force:true });
            return { ok:false, canceled:true };
        }
        const licence = require(path.join(RES_SERVER,'shared','licence.js'));
        if (!licence.status(destination.instanceId,{dataDir:BASE_DIR}).canWrite) throw new Error('This licence does not allow a restore.');
        let videos = 0;
        const srcVideos = path.join(stage, 'videos');
        if (fs.existsSync(srcVideos)) {
            fs.mkdirSync(path.join(BASE_DIR, 'videos'), { recursive: true });
            for (const f of fs.readdirSync(srcVideos)) {
                if (/\.(mp4|webm)$/i.test(f)) {
                    fs.copyFileSync(path.join(srcVideos, f), path.join(BASE_DIR, 'videos', f));
                    videos++;
                }
            }
        }
        const response = await fetch(`http://localhost:${PORT}/api/restore-state`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({state:parsed,expectedInstanceId:destination.instanceId})
        });
        const outcome = await response.json();
        fs.rmSync(stage, { recursive:true, force:true });
        if (!response.ok) throw new Error(outcome.error || 'Restore could not be committed.');
        const recovery=path.join(path.dirname(dataFile),'test-drive-local-recovery.json');
        if(fs.existsSync(recovery)) {
            const recoveryDirectory=path.join(BASE_DIR,'local-queue-recovery');fs.mkdirSync(recoveryDirectory,{recursive:true});
            fs.copyFileSync(recovery,path.join(recoveryDirectory,`backup-${Date.now()}.json`));
        }
        return { ok:true, videos, reloaded:true, identityPreserved:true, instanceId:outcome.instanceId, safetyBackup:outcome.backupFile };
    } catch (e) {
        return { ok: false, reason: 'error', error: e.message };
    } finally {
        if (restoreStage) fs.rmSync(restoreStage, { recursive:true, force:true });
    }
});

// ---- Uninstall: hand off to the NSIS uninstaller, then close the app ----
// The NSIS uninstaller keeps %APPDATA%\TDQSYS untouched by default. Since TDQSYS
// is per-location data, uninstalling must leave the PC clean: once the uninstall
// is confirmed (app folder fully removed) we also wipe the local data folder, so
// a reinstall starts from the generic fresh state. The ONLY way to get queue
// state back is the backup file, so the UI still prompts for a backup first.
ipcMain.handle('af:uninstallApp', () => {
    if (!fs.existsSync(UNINSTALLER_EXE)) return { ok: false, reason: 'no-uninstaller' };
    app.isQuitting = true;     // engines/TTS must not resurrect
    cleanup();
    const child = spawn(UNINSTALLER_EXE, [], { detached: true, stdio: 'ignore' });
    // Without this, a failed launch (permissions, a corrupt uninstaller) is an
    // unhandled 'error' event - it crashes the app in the middle of an
    // uninstall, which is the worst possible moment to lose it.
    child.on('error', (err) => log(`uninstaller failed to start: ${err.message}`));
    child.unref();
    // The NSIS uninstaller removes every file but cannot delete its own working
    // directory, so an empty app folder is left behind. Once it exits, sweep the
    // folder away ONLY if it is empty (never remove a half-uninstalled install),
    // and only then delete the data folder so a reinstall starts generic.
    try {
        const installDir = path.dirname(process.execPath);
        const dataDir = BASE_DIR;
        const uninstPid = child.pid;
        const sweepScript =
            `$dir = ${pshQuote(installDir)}; ` +
            `$data = ${pshQuote(dataDir)}; ` +
            `$unpid = ${uninstPid}; ` +
            `$deadline = (Get-Date).AddSeconds(120); ` +
            `while ((Get-Date) -lt $deadline) { ` +
            `  Start-Sleep -Milliseconds 400; ` +
            `  try { $items = @(Get-ChildItem -LiteralPath $dir -Recurse -Force -ErrorAction Stop) } catch { break }; ` +
            `  if ($items.Count -eq 0) { ` +
            `    Remove-Item -LiteralPath $dir -Force -ErrorAction SilentlyContinue; ` +
            `    Remove-Item -LiteralPath $data -Recurse -Force -ErrorAction SilentlyContinue; ` +
            `    break ` +
            `  }; ` +
            `  if (-not (Get-Process -Id $unpid -ErrorAction SilentlyContinue)) { break } ` +
            `}`;
        const sweep = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', sweepScript],
            { detached: true, stdio: 'ignore', windowsHide: true });
        // Same reasoning: a failed sweep must not take the app down. The
        // uninstall itself has already completed at this point.
        sweep.on('error', (err) => log(`post-uninstall sweep failed to start: ${err.message}`));
        sweep.unref();
    } catch { /* best-effort — uninstall still completed normally */ }
    setTimeout(() => app.quit(), 800);
    return { ok: true };
});

// Keep running in the tray when all windows close, so the operator can reopen
// the dashboard without restarting the engine/TTS. Quit only via tray menu.
app.on('window-all-closed', () => {
    // no-op: app keeps running (tray). Explicit quit via tray -> app.quit().
});
