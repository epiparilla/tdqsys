// tdqsys desktop app - main process.
// Responsibilities:
//  1. Spawn/own the local queue engine (video_server.js) and TTS server (tts_server.py)
//  2. Open the display window on the correct screen (auto-detect 2nd display)
//  3. Own cloud sync (single push source) when AF_OWNER_SYNC is passed to the engine
//  4. Open the settings/dashboard screen on the main (local) monitor
// Portable mode: data and videos live next to the app (AF_DATA_DIR = __dirname).
// Installed mode: AF_DATA_DIR = %APPDATA%/tdqsys (set by installer).

const { app, BrowserWindow, Tray, Menu, screen, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');

const IS_PACKAGED = app.isPackaged;
const APP_DIR = __dirname;

// ---- Paths ----
// Portable/packaged: data beside the app. Installed (Phase 5+): %APPDATA%.
// Dev (npx electron .): leave AF_DATA_DIR unset so the engine uses the project
// root data.json/videos exactly like running `node video_server.js` does.
const BASE_DIR = app.isPackaged
    ? (process.env.AF_DATA_DIR || APP_DIR)
    : (process.env.AF_DATA_DIR || path.join(APP_DIR, '..'));
const ENGINE_PATH = path.join(APP_DIR, '..', 'video_server.js');
const TTS_PATH = path.join(APP_DIR, '..', 'tts_server.py');
const PORT = parseInt(process.env.AF_PORT, 10) || 80;
const TTS_PORT = parseInt(process.env.AF_TTS_PORT, 10) || 8001;

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
        stdio: ['ignore', 'pipe', 'pipe']
    });
    engineProcess.stdout.on('data', d => log(`engine: ${d.toString().trim()}`));
    engineProcess.stderr.on('data', d => log(`engine: ${d.toString().trim()}`));
    engineProcess.on('exit', (code) => {
        log(`engine exited (${code}). Restarting in 2s...`);
        setTimeout(startEngine, 2000);
    });
}

function startTTS() {
    if (!fs.existsSync(TTS_PATH)) { log('TTS server script missing, skipping.'); return; }
    const python = process.env.AF_PYTHON || 'python';
    log(`starting TTS server (${python} ${TTS_PATH}) on port ${TTS_PORT}`);
    ttsProcess = spawn(python, [TTS_PATH], {
        cwd: path.dirname(TTS_PATH),
        env: { ...process.env, AF_DATA_DIR: BASE_DIR, AF_TTS_PORT: String(TTS_PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    ttsProcess.stdout.on('data', d => log(`tts: ${d.toString().trim()}`));
    ttsProcess.stderr.on('data', d => log(`tts: ${d.toString().trim()}`));
    ttsProcess.on('exit', (code) => {
        log(`tts exited (${code}). Restarting in 3s...`);
        setTimeout(() => { if (!app.isQuitting) startTTS(); }, 3000);
    });
}

// ---- Cloud sync owned by desktop (single push source) ----
let cloudTimer = null;
async function cloudSyncTick() {
    if (engineDown()) return;
    try {
        // Read current local config to know cloud base + site.
        const cfgRes = await fetch(`http://localhost:${PORT}/api/config`);
        const cfg = await cfgRes.json();
        const base = cfg && cfg.cloudBase;
        const site = cfg && cfg.site;
        if (!base) return; // offline-only

        const url = `${base}/api/save?site=${encodeURIComponent(site)}`;
        const localRes = await fetch(`http://localhost:${PORT}/api/data`);
        const localData = await localRes.json();

        const payload = JSON.stringify(localData);
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            res.resume();
            if (res.statusCode !== 200) log(`cloud push status ${res.statusCode}`);
        });
        req.on('error', () => {/* offline; retry next tick */});
        req.end(payload);
    } catch (e) { /* engine/config not ready */ }
}

function startCloudSync() {
    cloudTimer = setInterval(cloudSyncTick, 10000);
    cloudSyncTick();
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

// Open (or reopen if closed) the dashboard window.
function openDashboardWindow() {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        if (dashboardWindow.isMinimized()) dashboardWindow.restore();
        dashboardWindow.show();
        dashboardWindow.focus();
        return dashboardWindow;
    }
    dashboardWindow = openLocalWindow({
        page: 'index.html',
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

    startEngine();
    startTTS();
    startCloudSync();

    // Registration area shortcut: dashboard on the local monitor, display on TV.
    openDashboardWindow();

    setTimeout(() => { if (displayMode === 'auto') openDisplayWindow(); }, 6000); // after engine boots

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
    if (engineProcess) engineProcess.kill();
    if (ttsProcess) ttsProcess.kill();
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

// Keep running in the tray when all windows close, so the operator can reopen
// the dashboard without restarting the engine/TTS. Quit only via tray menu.
app.on('window-all-closed', () => {
    // no-op: app keeps running (tray). Explicit quit via tray -> app.quit().
});