// tdqsys desktop app - main process.
// Responsibilities:
//  1. Spawn/own the local queue engine (video_server.js) and TTS server (tts_server.py)
//  2. Open the display window on the correct screen (auto-detect 2nd display)
//  3. Own cloud sync (single push source) when AF_OWNER_SYNC is passed to the engine
//  4. Open the settings/dashboard screen on the main (local) monitor
// Portable mode: data and videos live next to the app (AF_DATA_DIR = __dirname).
// Installed mode: AF_DATA_DIR = %APPDATA%/tdqsys (set by installer).

const { app, BrowserWindow, Tray, Menu, screen, ipcMain, dialog, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const IS_PACKAGED = app.isPackaged;
const APP_DIR = __dirname;

// ---- Paths ----
// Dev (npx electron .): engine/TTS run from the project root; AF_DATA_DIR unset
// the engine uses the project root data.json/videos exactly like `node video_server.js`.
// Installed (NSIS): engine/TTS/site/models live in resources/server/; data + imported
// videos go to %APPDATA%\tdqsys (AF_DATA_DIR). See assemble-server.ps1.
const IS_INSTALLED = app.isPackaged;
const RES_SERVER = IS_INSTALLED ? path.join(process.resourcesPath, 'server') : path.join(APP_DIR, '..');
const BASE_DIR = IS_INSTALLED
    ? (process.env.AF_DATA_DIR || path.join(app.getPath('appData'), 'tdqsys'))
    : (process.env.AF_DATA_DIR || path.join(APP_DIR, '..'));
const ENGINE_PATH = IS_INSTALLED
    ? path.join(RES_SERVER, 'video_server.js')
    : path.join(APP_DIR, '..', 'video_server.js');
const TTS_PATH = IS_INSTALLED
    ? path.join(RES_SERVER, 'tts_server.exe')
    : path.join(APP_DIR, '..', 'tts_server.py');
const PORT = parseInt(process.env.AF_PORT, 10) || 8081;
const TTS_PORT = parseInt(process.env.AF_TTS_PORT, 10) || 8001;

// ---- Uninstall (installed NSIS builds) ----
// electron-builder NSIS names the per-user uninstaller "<ProductName>.exe" and
// places it next to the app. Its presence also lets us tell "installed" apart
// from "portable" (which extracts to a temp dir and has no uninstaller).
const PRODUCT_NAME = 'tdqsys Queue System';
const UNINSTALLER_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', PRODUCT_NAME, `Uninstall ${PRODUCT_NAME}.exe`);

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

// ---- Engine & TTS process management ----
function startEngine() {
    log(`starting engine ${ENGINE_PATH} (port ${PORT}) dataDir=${BASE_DIR}`);
    engineProcess = spawn(process.execPath, [ENGINE_PATH], {
        cwd: path.dirname(ENGINE_PATH),
        env: {
            ...process.env,
            AF_DATA_DIR: BASE_DIR,
            AF_OWNER_SYNC: '1',
            AF_PORT: String(PORT),
            ELECTRON_RUN_AS_NODE: '1'   // use Electron's embedded Node to run the engine
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true   // no visible console for the engine (runs headless)
    });
    engineProcess.stdout.on('data', d => log(`engine: ${d.toString().trim()}`));
    engineProcess.stderr.on('data', d => log(`engine: ${d.toString().trim()}`));
    engineProcess.on('exit', (code) => {
        if (app.isQuitting) return;   // real quit: never resurrect
        log(`engine exited (${code}). Restarting in 2s...`);
        setTimeout(startEngine, 2000);
    });
}

function startTTS() {
    if (!fs.existsSync(TTS_PATH)) { log('TTS server missing, skipping.'); return; }
    log(`starting TTS server (${TTS_PATH}) on port ${TTS_PORT}`);
    if (IS_INSTALLED) {
        // Installed build: packaged PyInstaller exe, run directly (no python on PATH).
        ttsProcess = spawn(TTS_PATH, [], {
            cwd: path.dirname(TTS_PATH),
            env: { ...process.env, AF_DATA_DIR: BASE_DIR, AF_TTS_PORT: String(TTS_PORT) },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true   // packaged TTS console-subsystem exe: keep it hidden
        });
    } else {
        // Dev: tts_server.py under system python, next to the engine in the project root.
        const python = process.env.AF_PYTHON || 'python';
        ttsProcess = spawn(python, [TTS_PATH], {
            cwd: path.dirname(TTS_PATH),
            env: { ...process.env, AF_DATA_DIR: BASE_DIR, AF_TTS_PORT: String(TTS_PORT) },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true   // dev python console: keep it hidden (darwin/linux: no-op)
        });
    }
    ttsProcess.stdout.on('data', d => log(`tts: ${d.toString().trim()}`));
    ttsProcess.stderr.on('data', d => log(`tts: ${d.toString().trim()}`));
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
let lastPushedHash = null;
let lastPushAt = 0;
const FORCE_PUSH_MS = 15 * 60 * 1000;   // re-push at most ~96x/day, even if unchanged

function pushState(base, site, localData) {
    const url = `${base}/api/save?site=${encodeURIComponent(site)}`;
    const payload = JSON.stringify(localData);
    const u = new URL(url);
    const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
        res.resume();
        if (res.statusCode === 200) {
            lastPushedHash = crypto.createHash('sha256').update(payload).digest('hex');
            lastPushAt = Date.now();
        } else {
            log(`cloud push status ${res.statusCode}`);
        }
    });
    req.on('error', () => {/* offline; retry next tick (hash stays stale) */});
    req.end(payload);
}

async function cloudSyncTick() {
    if (engineDown()) return;
    try {
        // Read current local config to know cloud base + site.
        const cfgRes = await fetch(`http://localhost:${PORT}/api/config`);
        const cfg = await cfgRes.json();
        const base = cfg && cfg.cloudBase;
        const site = cfg && cfg.site;
        if (!base) return; // offline-only

        const localRes = await fetch(`http://localhost:${PORT}/api/data`);
        const localData = await localRes.json();

        const payload = JSON.stringify(localData);
        const hash = crypto.createHash('sha256').update(payload).digest('hex');

        // Skip write when nothing changed since the last successful push
        // (unless the keep-alive window elapsed).
        if (hash === lastPushedHash && Date.now() - lastPushAt < FORCE_PUSH_MS) return;

        pushState(base, site, localData);
    } catch (e) { /* engine/config not ready */ }
}

// ---- Software update check (version.json hosted next to the site) ----
// The app fetches `${cloudBase}/version.json`, compares the "version" field
// against the installed app version, and surfaces a "download" link when a
// newer build exists. Manual check from the settings page, plus a one-shot
// background check shortly after boot that pushes af:update-available to the
// open windows. Offline / missing manifest degrades to "up to date", never to
// an error dialog.
const UPDATE_MANIFEST = 'version.json';

function compareVersions(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0, db = pb[i] || 0;
        if (da !== db) return da > db ? 1 : -1;
    }
    return 0;
}

async function currentCloudBase() {
    try {
        const cfgRes = await fetch(`http://localhost:${PORT}/api/config`);
        const cfg = await cfgRes.json();
        if (cfg && cfg.cloudBase) return cfg.cloudBase;
    } catch { /* engine not ready yet */ }
    return null;
}

async function checkForUpdates() {
    const current = app.getVersion();
    let manifestUrl = null;
    const base = await currentCloudBase();
    if (base) manifestUrl = `${base.replace(/\/+$/, '')}/${UPDATE_MANIFEST}`;
    if (!manifestUrl) {
        return { ok: false, reason: 'no-cloud-base', current, latest: null, url: null, notes: null };
    }
    try {
        const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
            return { ok: true, current, latest: null, url: null, notes: null }; // 404 => no published manifest yet
        }
        const m = await res.json();
        const latest = m && m.version ? String(m.version) : null;
        return {
            ok: true,
            current,
            latest,
            url: (m && m.url) || null,
            notes: (m && m.notes) || null,
            updateAvailable: latest ? compareVersions(latest, current) > 0 : false
        };
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

function startCloudSync() {
    cloudTimer = setInterval(cloudSyncTick, 10000);
    cloudSyncTick();
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
    const script = path.join(app.getPath('temp'), 'tdqsys-firewall.ps1');
    const esc = (s) => String(s).replace(/'/g, "''");
    const lines = [
        'function Add-Rule($name,$port) {',
        '  netsh advfirewall firewall delete rule name="$name" | Out-Null',
        '  $LASTEXITCODE = 0',
        '  netsh advfirewall firewall add rule name="$name" dir=in action=allow protocol=TCP localport=$port | Out-Null',
        '  return $LASTEXITCODE',
        '}',
        `$d = '${esc(FW_DONE)}'`,
        `$ok1 = Add-Rule "tdqsys engine (TCP ${PORT})" ${PORT}`,
        `$ok2 = Add-Rule "tdqsys tts (TCP ${TTS_PORT})" ${TTS_PORT}`,
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
        page: wizardNotDone() ? 'settings.html' : 'index.html',
        width: 1200, height: 800,
        minWidth: 600, minHeight: 400
    });
    dashboardWindow.on('close', () => { dashboardWindow = null; });
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
    // push af:update-available to any open window if one exists.
    setTimeout(backgroundUpdateCheck, 15000);

    tray = new Tray(path.join(APP_DIR, 'icon.png'));
    tray.setToolTip('tdqsys Queue System');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open Dashboard', click: () => openDashboardWindow() },
        { label: 'Open TV Display', click: () => openDisplayWindow() },
        { type: 'separator' },
        { label: 'Restart', click: () => restartSystem() },
        { type: 'separator' },
        { label: 'Quit tdqsys', click: () => { app.isQuitting = true; app.quit(); } }
    ]));

    app.on('before-quit', () => { app.isQuitting = true; cleanup(); });
});

function restartSystem() {
    log('restarting engine + TTS + windows...');
    if (cloudTimer) clearInterval(cloudTimer);
    if (engineProcess) engineProcess.kill();   // exit handler auto-restarts in 2s
    if (ttsProcess) ttsProcess.kill();         // exit handler auto-restarts in 3s
    startCloudSync();
    // Reload open windows so they reconnect once the engine is back up.
    setTimeout(() => {
        [dashboardWindow, displayWindow].forEach(w => {
            if (w && !w.isDestroyed()) w.webContents.reload();
        });
    }, 6000);
}

function cleanup() {
    if (cloudTimer) clearInterval(cloudTimer);

    // Item 6 — "absolute shutdown": layered kills so nothing survives a quit.
    // 1) Graceful SIGTERM to both children.
    if (engineProcess) engineProcess.kill();
    if (ttsProcess) ttsProcess.kill();
    // 2) Force-kill each process tree (Windows: /T /F), covering any stragglers
    //    the graceful signal missed before the app fully exits.
    [engineProcess, ttsProcess].forEach(p => {
        if (!p) return;
        try { execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore', windowsHide: true }); } catch { /* already dead */ }
    });
    // 3) Net-sweep: anything still bound to our ports (e.g. a first-run engine
    //    crashed mid-restart of a.k.a. this app) is reaped too.
    killPortHolders([PORT, TTS_PORT]);

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

// Kill any process (ours or a leftover from a previous session) currently
// bound to a given set of local TCP ports. netstat -ano prints the owning PID
// in the last column, which we taskkill with its whole tree.
function killPortHolders(ports) {
    if (!Array.isArray(ports)) ports = [ports];
    let out = '';
    try { out = execSync('netstat -ano', { encoding: 'utf8', windowsHide: true }); }
    catch { return; }
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^\s*TCP\s+[0-9.:*\[\]]+:(\d+)\s+.*LISTENING\s+(\d+)\s*$/);
        if (m && ports.includes(parseInt(m[1], 10)) && m[2] !== '0' && m[2] !== String(process.pid)) {
            pids.add(m[2]);
        }
    }
    for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ }
    }
}

// IPC for settings page (native dialogs / file ops live here, not in browser JS).
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

// Software updates: renderer-triggered check + open download URL in browser.
ipcMain.handle('af:checkUpdates', () => checkForUpdates());
ipcMain.handle('af:openExternal', (_e, url) => { if (url) shell.openExternal(url); });

// ---- App info: mode (installed / portable / dev), data dir, uninstaller ----
ipcMain.handle('af:appInfo', () => ({
    mode: app.isPackaged ? (fs.existsSync(UNINSTALLER_EXE) ? 'installed' : 'portable') : 'dev',
    version: app.getVersion(),
    dataDir: BASE_DIR,
    uninstaller: UNINSTALLER_EXE
}));

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
            title: 'Backup tdqsys data',
            defaultPath: path.join(app.getPath('documents'), `tdqsys-backup-${stamp}.zip`),
            filters: [{ name: 'tdqsys Backup', extensions: ['zip'] }]
        });
        if (r.canceled || !r.filePath) return { ok: false, canceled: true };

        // Stage a copy of the live data (atomic against the engine's own writes).
        const stage = fs.mkdtempSync(path.join(app.getPath('temp'), 'tdqsys-bak-'));
        try {
            let items = 0;
            fs.mkdirSync(path.join(stage, 'videos'), { recursive: true });
            const dataFile = path.join(BASE_DIR, 'data.json');
            if (fs.existsSync(dataFile)) { fs.copyFileSync(dataFile, path.join(stage, 'data.json')); items++; }
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
    try {
        const r = await dialog.showOpenDialog({
            title: 'Restore tdqsys data from a backup',
            properties: ['openFile'],
            filters: [{ name: 'tdqsys Backup', extensions: ['zip'] }]
        });
        if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
        const zip = r.filePaths[0];

        const stage = fs.mkdtempSync(path.join(app.getPath('temp'), 'tdqsys-rst-'));
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

        // Commit into the live data dir.
        fs.mkdirSync(BASE_DIR, { recursive: true });
        fs.copyFileSync(dataFile, path.join(BASE_DIR, 'data.json'));
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
        fs.rmSync(stage, { recursive: true, force: true });

        // Reload the running engine so all screens pick up the restored state now.
        let reloaded = false;
        try {
            const resp = await fetch(`http://localhost:${PORT}/api/reload`, { method: 'POST' });
            reloaded = resp.ok;
        } catch { reloaded = false; }

        return { ok: true, videos, reloaded };
    } catch (e) {
        return { ok: false, reason: 'error', error: e.message };
    }
});

// ---- Uninstall: hand off to the NSIS uninstaller, then close the app ----
// The uninstaller keeps the %APPDATA%\tdqsys data folder by default, so queue
// state survives; the user is still prompted to make a backup first in the UI.
ipcMain.handle('af:uninstallApp', () => {
    if (!fs.existsSync(UNINSTALLER_EXE)) return { ok: false, reason: 'no-uninstaller' };
    app.isQuitting = true;     // engines/TTS must not resurrect
    cleanup();
    const child = spawn(UNINSTALLER_EXE, [], { detached: true, stdio: 'ignore' });
    child.unref();
    setTimeout(() => app.quit(), 800);
    return { ok: true };
});

// Keep running in the tray when all windows close, so the operator can reopen
// the dashboard without restarting the engine/TTS. Quit only via tray menu.
app.on('window-all-closed', () => {
    // no-op: app keeps running (tray). Explicit quit via tray -> app.quit().
});