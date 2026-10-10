const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { defaultState, migrateLegacy, ensureInstanceId } = require('./shared/config');
const licence = require('./shared/licence');

const PORT = parseInt(process.env.AF_PORT, 10) || 80;
// Data location: override from Electron (portable -> beside exe; installed -> %APPDATA%).
const DATA_DIR = process.env.AF_DATA_DIR || __dirname;
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// Helper to log with timestamps
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// Startup diagnostics
log(`__dirname   = ${__dirname}`);
log(`PUBLIC_DIR  = ${PUBLIC_DIR}`);
log(`PUBLIC_DIR exists: ${fs.existsSync(PUBLIC_DIR)}`);

// Initialize Local Backup Store (full state doc: { config, queues, reannounce })
let localData = defaultState();
if (fs.existsSync(DATA_FILE)) {
    try {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE));
        const legacy = migrateLegacy(raw);
        if (legacy) {
            localData = legacy;
            fs.writeFileSync(DATA_FILE, JSON.stringify(localData));
            log("Migrated legacy v1 data.json into v2 schema.");
        } else if (raw && raw.config && raw.queues) {
            localData = raw;
            log("Successfully loaded local backup queue data.");
        } else {
            log("data.json has unrecognized shape, starting fresh.");
        }
    } catch (e) {
        log("Failed to parse local data.json, starting fresh.");
    }
} else {
    // Fresh install: defaultState() assigned a brand-new instanceId + site
    // label so this location is unique on the cloud mirror from the very first
    // boot. Persist it right away so the identity is stable across restarts
    // (data.json is a true read/write mirror of localData once it exists).
    log(`Fresh start - new instance id "${localData.config.instanceId}" (label "${localData.config.site}").`);
    log("First run uses a generic 1-brand/1-car config; configure it in the wizard.");
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(localData));
    } catch (e) {
        log("Could not persist fresh data.json: " + e.message);
    }
}

// 1.1.8-era or restored configs may lack an instanceId. Mint one now and persist
// so the cloud mirror key stays stable from here on.
if (ensureInstanceId(localData.config)) {
    log(`Backfilled instance id "${localData.config.instanceId}" for this installation.`);
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(localData)); } catch (e) { /* best-effort */ }
}

const HOSTNAME = () => (localData.config && localData.config.hostname) || 'tdqsys.local';
const CLOUD_BASE = () => (localData.config && localData.config.cloudBase) || '';
const INSTANCE = () => (localData.config && localData.config.instanceId) || 'none';

// Derived cloud endpoints (empty cloudBase => cloud sync disabled).
// The mirror is keyed ONLY by instanceId, so two PCs naming themselves the same
// thing can never mix or overwrite each other's cloud data.
// Computed per-use so settings saves take effect without a restart.
const CLOUD_DATA_URL = () => { const cb = CLOUD_BASE(); return cb ? `${cb}/api/data?id=${INSTANCE()}` : null; };
const CLOUD_SAVE_URL = () => { const cb = CLOUD_BASE(); return cb ? `${cb}/api/save?id=${INSTANCE()}` : null; };

// ---- CONNECTIVITY WATCHDOG ----
// Under the desktop app the Electron main process owns cloud sync (single
// push source). When AF_OWNER_SYNC=1 the watchdog here is disabled.
const OWNER_SYNC = process.env.AF_OWNER_SYNC === '1';
let wasOnline = null; // null = unknown (first run)

function pushToCloud() {
    const url = CLOUD_SAVE_URL();
    if (!url) return;
    log("Internet restored! Pushing local queue data to Cloudflare...");
    const payload = JSON.stringify(localData);
    const urlObj = new URL(url);
    const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };
    const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
            log("Successfully pushed local data to Cloudflare! Mobile clients are now in sync.");
        } else {
            log(`Cloudflare push returned status: ${res.statusCode}`);
        }
        res.resume();
    });
    req.on('error', (e) => log(`Cloud push failed: ${e.message}`));
    req.write(payload);
    req.end();
}

function checkConnectivity() {
    const url = CLOUD_DATA_URL();
    if (!url) return;
    https.get(url, (res) => {
        const isOnline = res.statusCode === 200;
        res.resume();
        if (isOnline && wasOnline === false) {
            pushToCloud();
        }
        wasOnline = isOnline;
    }).on('error', () => {
        if (wasOnline !== false) {
            log("Internet connection lost. Running in offline mode — local data is master.");
        }
        wasOnline = false;
    });
}

if (!OWNER_SYNC) {
    setInterval(checkConnectivity, 10000);
    checkConnectivity(); // run immediately on startup
} else {
    log("Running under desktop app — cloud sync is owned by Electron main.");
}

// ---------------------------------------------------------------------------
// Licence gate
// ---------------------------------------------------------------------------

// Re-read on every request rather than caching: an operator can paste a renewal
// while the booth is running, and the clock guard has to run on every check.
function licenceStatus() {
    return licence.status(INSTANCE(), { dataDir: DATA_DIR });
}

/**
 * Refuse a write when the licence does not currently allow one.
 * Reads are never blocked - an expired booth must keep serving cars.
 */
function gateWrite(req, res) {
    const st = licenceStatus();
    if (st.canWrite) return true;

    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'Licence does not allow changes.',
        licenceState: st.state,
        licenceDetail: st.detail,
        canWrite: false
    }));
    log(`Refused ${req.method} ${req.url} - licence ${st.state}: ${st.detail || 'no detail'}`);
    return false;
}

/**
 * Merge incoming queue values into the existing queues, keyed by brand and car.
 *
 * A save that only mentions some cars must not DELETE the others. The queue
 * layout is owned by config: every car that config declares keeps a slot, and
 * the incoming value wins only where one was actually sent. Replacing the
 * object wholesale meant a partial payload silently removed cars the operator
 * had configured - and, because the mirror is pushed to the cloud, removed
 * them from every phone too.
 *
 * Unknown brands/cars in the incoming payload are ignored rather than stored,
 * so a stale client cannot resurrect a car the operator has since deleted.
 */
function mergeQueues(existing, incoming, config) {
    const out = {};
    const brands = (config && config.brands) || [];

    for (const brand of brands) {
        const key = brand.key;
        const prev = (existing && existing[key]) || {};
        const next = (incoming && incoming[key]) || {};
        const slots = {};
        (brand.models || []).forEach((_, idx) => {
            const slot = String(idx + 1);
            let v = next[slot];
            if (v === undefined || v === null || v === '' || isNaN(parseInt(v, 10))) {
                v = prev[slot];
            }
            slots[slot] = (v === undefined || v === null || v === '' || isNaN(parseInt(v, 10)))
                ? 0 : Math.max(0, parseInt(v, 10));
        });
        out[key] = slots;
    }
    return out;
}

const server = http.createServer((req, res) => {
    // 1. Massive CORS allowance so Cloudflare site can access local files securely
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 2. The Video API Indexer -> Scans folder and returns JSON list of videos
    if (req.url === '/api/videos' && req.method === 'GET') {
        fs.readdir(VIDEOS_DIR, (err, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Failed to read videos directory." }));
            }
            const videoFiles = files.filter(file => file.endsWith('.mp4') || file.endsWith('.webm'));
            const playlist = videoFiles.map(file => `http://${req.headers.host}/videos/${encodeURIComponent(file)}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(playlist));
        });
        return;
    }

    // 3. Local Queue API Sync (Redundancy Backend)
    if (req.url === '/api/data' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(localData));
    }

    if (req.url === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(localData.config));
    }

    // 3. Licence status. Readable in every state, including expired - Settings
    // must be able to show why nothing is saving and offer a renewal.
    if (req.url === '/api/license' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(licenceStatus()));
    }

    if (req.url === '/api/license' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body || '{}');

                // The operator asks the machine to describe itself so the code
                // they send us can be checked against the right instance.
                if (incoming && incoming.describe) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({
                        instanceId: INSTANCE(),
                        site: (localData.config && localData.config.site) || null,
                        status: licenceStatus()
                    }));
                }

                const result = licence.activate(incoming.code, INSTANCE());
                res.writeHead(result.stored ? 200 : 400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({
                    stored: result.stored,
                    status: result.stored ? licenceStatus() : result.status
                }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Could not read that licence code.' }));
            }
        });
        return;
    }

    if (req.url === '/api/save' && req.method === 'POST') {
        if (!gateWrite(req, res)) return;
        const previous = localData;
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body);
                if (incoming && incoming.queues && incoming.config) {
                    // Full state doc: keep incoming config too (settings/wizard save)
                    localData = incoming;
                    // The instance id is minted once and then belongs to this
                    // installation forever. It is the licence binding AND the
                    // cloud key, so a caller posting a config without one - or
                    // with someone else's - must never be allowed to change it.
                    const mine = (previous && previous.config && previous.config.instanceId)
                        || localData.config.instanceId;
                    if (mine) localData.config.instanceId = mine;
                    // Same reasoning for the cars: a partial payload must not be
                    // able to delete a brand or a car the operator configured.
                    localData.queues = mergeQueues(
                        (previous && previous.queues) || {}, localData.queues, localData.config);
                } else if (incoming && incoming.queues) {
                    // Queue-only save from dashboard: preserve local config + reannounce marker
                    localData.queues = mergeQueues(localData.queues, incoming.queues, localData.config);
                    if (incoming.reannounce) localData.reannounce = incoming.reannounce;
                } else {
                    throw new Error("Invalid payload shape");
                }
                fs.writeFileSync(DATA_FILE, JSON.stringify(localData));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end("Bad Request");
            }
        });
        return;
    }

    // 3.5 Reload from disk -> Re-reads data.json (used after a backup restore).
    // The desktop app restores data.json on disk then calls this so the running
    // engine (and every connected screen) picks up the restored queue state
    // without a full engine restart.
    if (req.url === '/api/reload' && req.method === 'POST') {
        if (!fs.existsSync(DATA_FILE)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "No local data.json to reload." }));
        }
        try {
            const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            if (raw && raw.config && raw.queues) {
                localData = raw;
                log("Reloaded data.json from disk (backup restore).");
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            }
            throw new Error("Invalid data.json shape");
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "data.json is invalid; engine kept its current state." }));
        }
    }

    // 4. Video Import -> Receives a raw video file and saves it into /videos
    if (req.url.startsWith('/api/import') && req.method === 'POST') {
        if (!gateWrite(req, res)) return;
        const url = new URL(req.url, `http://${req.headers.host}`);
        const name = decodeURIComponent(url.searchParams.get('name') || '');
        if (!name || !/\.(mp4|webm)$/i.test(name)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Filename must end with .mp4 or .webm (name=..." }));
        }
        const safeName = path.basename(name).replace(/[^a-zA-Z0-9._ -]/g, '_');
        const dest = path.join(VIDEOS_DIR, safeName);
        const out = fs.createWriteStream(dest);
        req.pipe(out);
        let bytes = 0;
        req.on('data', chunk => { bytes += chunk.length;
            if (bytes > 4 * 1024 * 1024 * 1024) { // 4GB safety cap
                out.destroy();
                req.destroy();
                res.writeHead(413, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "File too large (max 4GB)." }));
            }
        });
        req.on('end', () => {
            if (!out.writableEnded) { out.end(); }
        });
        out.on('finish', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, name: safeName, size: bytes }));
        });
        out.on('error', () => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to write video file." }));
        });
        return;
    }

    // 4.5 Clear Videos -> Deletes every mp4/webm in the videos folder
    if (req.url === '/api/clearVideos' && req.method === 'POST') {
        if (!gateWrite(req, res)) return;
        fs.readdir(VIDEOS_DIR, (err, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: "Failed to read videos directory." }));
            }
            let removed = 0;
            const videoFiles = files.filter(file => file.endsWith('.mp4') || file.endsWith('.webm'));
            const pending = videoFiles.map(file => new Promise((resolve) => {
                fs.unlink(path.join(VIDEOS_DIR, file), () => { removed++; resolve(); });
            }));
            Promise.all(pending).then(() => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, removed }));
            });
        });
        return;
    }

    // 5. The Video Streamer -> Serves large mp4 files with Proper range support
    if (req.url.startsWith('/videos/')) {
        // Resolve relative to VIDEOS_DIR (not __dirname — the app data folder
        // lives in %APPDATA% on installed builds, so __dirname-based paths would
        // 403 there). basename + the prefix check below keep it inside VIDEOS_DIR.
        const decodedUrl = decodeURIComponent(req.url).split('?')[0];
        const safeName = path.basename(decodedUrl.replace(/^\/videos\//, ''));
        const filePath = path.join(VIDEOS_DIR, safeName);

        if (!filePath.startsWith(VIDEOS_DIR)) {
            res.writeHead(403);
            return res.end('Forbidden');
        }

        fs.stat(filePath, (err, stat) => {
            if (err) {
                res.writeHead(404);
                return res.end('Video not found.');
            }

            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4'
                });
                const fileStream = fs.createReadStream(filePath, { start, end });
                fileStream.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4'
                });
                fs.createReadStream(filePath).pipe(res);
            }
        });
        return;
    }

    // 5. Offline Hub -> Serves the HTML/CSS if internet completely crashes
    if (req.method === 'GET') {
        let safePath = req.url === '/' ? 'index.html' : req.url;
        safePath = safePath.split('?')[0];
        safePath = safePath.replace(/^\/+/, '');
        safePath = safePath.replace(/\.\.[\/\\]/g, '');

        const filePath = path.join(PUBLIC_DIR, safePath);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const mimeTypes = {
                '.html': 'text/html',
                '.js':   'text/javascript',
                '.css':  'text/css',
                '.png':  'image/png',
                '.jpg':  'image/jpeg',
                '.svg':  'image/svg+xml'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            return fs.createReadStream(filePath).pipe(res);
        }
    }

    res.writeHead(404);
    res.end('Not Found');
});

// Create videos directory proactively if missing
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR);

server.listen(PORT, '0.0.0.0', () => {
    log(`TDQSYS Engine & Offline Hub running on http://localhost:${PORT}`);
    log(`Hostname: ${HOSTNAME()}   Instance: ${INSTANCE()}   Site(label): ${localData.config.site || 'auto-01'}   CloudBase: ${CLOUD_BASE() || '(disabled)'}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        log(`ERROR: Port ${PORT} is already in use!`);
        log(`Fix: Close all other Node windows then run test_server.bat again.`);
        log(`Or press Windows+R, type: taskkill /F /IM node.exe and try again.`);
    } else {
        log(`Server error: ${err.message}`);
    }
    process.exit(1);
});