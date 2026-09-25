const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { defaultState, migrateLegacy } = require('./shared/config');

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
}

const HOSTNAME = () => (localData.config && localData.config.hostname) || 'tdqsys.local';
const CLOUD_BASE = () => (localData.config && localData.config.cloudBase) || '';
const SITE = () => (localData.config && localData.config.site) || 'auto-01';

// Derived cloud endpoints (empty cloudBase => cloud sync disabled).
// Computed per-use so settings saves take effect without a restart.
const CLOUD_DATA_URL = () => { const cb = CLOUD_BASE(); return cb ? `${cb}/api/data?site=${SITE()}` : null; };
const CLOUD_SAVE_URL = () => { const cb = CLOUD_BASE(); return cb ? `${cb}/api/save?site=${SITE()}` : null; };

// Auto-seed: Pull latest data from Cloudflare on startup if local is empty
function isDataEmpty(data) {
    const q = data.queues || {};
    return Object.values(q).every((brandQueues) => {
        const vals = Object.values(brandQueues || {});
        return vals.every(v => v === 0);
    });
}

function seedFromCloud() {
    const url = CLOUD_DATA_URL();
    if (!url) { log("No cloud base configured — starting locally."); return; }
    log("Local data is empty — seeding from Cloudflare...");
    https.get(url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const cloudData = JSON.parse(body);
                if (cloudData && cloudData.queues) {
                    localData = cloudData;
                    fs.writeFileSync(DATA_FILE, JSON.stringify(localData));
                    log("Successfully seeded local data from Cloudflare!");
                }
            } catch (e) {
                log("Failed to parse Cloudflare seed response.");
            }
        });
    }).on('error', (err) => {
        log("Could not reach Cloudflare to seed data (no internet?). Starting with zeros.");
    });
}

if (isDataEmpty(localData)) {
    seedFromCloud();
} else {
    log("Local data loaded — skipping cloud seed.");
}

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

    if (req.url === '/api/save' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body);
                if (incoming && incoming.queues && incoming.config) {
                    // Full state doc: keep incoming config too (settings/wizard save)
                    localData = incoming;
                } else if (incoming && incoming.queues) {
                    // Queue-only save from dashboard: preserve local config + reannounce marker
                    localData.queues = incoming.queues;
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

    // 4. Video Import -> Receives a raw video file and saves it into /videos
    if (req.url.startsWith('/api/import') && req.method === 'POST') {
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

    // 5. The Video Streamer -> Serves large mp4 files with Proper range support
    if (req.url.startsWith('/videos/')) {
        const decodedUrl = decodeURIComponent(req.url).split('?')[0];
        const filePath = path.join(__dirname, decodedUrl);

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
    log(`AutoFocus Queue Engine & Offline Hub running on http://localhost:${PORT}`);
    log(`Hostname: ${HOSTNAME()}   Site: ${SITE()}   CloudBase: ${CLOUD_BASE() || '(disabled)'}`);
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