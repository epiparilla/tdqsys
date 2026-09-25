const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 80;
const VIDEOS_DIR = path.join(__dirname, 'videos');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');

// Your Cloudflare project URL for seeding
const CLOUD_DATA_URL = 'https://test-drive-queue.pages.dev/api/data';

// Helper to log with timestamps
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// Startup diagnostics
log(`__dirname   = ${__dirname}`);
log(`PUBLIC_DIR  = ${PUBLIC_DIR}`);
log(`PUBLIC_DIR exists: ${fs.existsSync(PUBLIC_DIR)}`);

// Initialize Local Backup Store
let localData = { lexus: {}, toyota: {} };
if (fs.existsSync(DATA_FILE)) {
    try { 
        localData = JSON.parse(fs.readFileSync(DATA_FILE)); 
        log("Successfully loaded local backup queue data.");
    } catch(e) { log("Failed to parse local data.json, starting fresh."); }
}

// Auto-seed: Pull latest data from Cloudflare on startup if local is empty
function isDataEmpty(data) {
    return !data || (Object.keys(data.lexus || {}).length === 0 && Object.keys(data.toyota || {}).length === 0);
}

function seedFromCloud() {
    log("Local data is empty — seeding from Cloudflare...");
    https.get(CLOUD_DATA_URL, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const cloudData = JSON.parse(body);
                localData = cloudData;
                fs.writeFileSync(DATA_FILE, JSON.stringify(localData));
                log("Successfully seeded local data from Cloudflare!");
            } catch(e) {
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
// Tracks whether the internet was online last check
const CLOUD_SAVE_URL  = 'https://test-drive-queue.pages.dev/api/save';
let wasOnline = null; // null = unknown (first run)

function pushToCloud() {
    log("Internet restored! Pushing local queue data to Cloudflare...");
    const payload = JSON.stringify(localData);
    const urlObj = new URL(CLOUD_SAVE_URL);
    const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
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
    });
    req.on('error', (e) => log(`Cloud push failed: ${e.message}`));
    req.write(payload);
    req.end();
}

function checkConnectivity() {
    https.get(CLOUD_DATA_URL, (res) => {
        const isOnline = res.statusCode === 200;
        // Drain the response to avoid memory leaks
        res.resume();

        if (isOnline && wasOnline === false) {
            // Transition: offline -> online. Push local data to cloud!
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

// Check connectivity every 10 seconds
setInterval(checkConnectivity, 10000);
checkConnectivity(); // run immediately on startup

const server = http.createServer((req, res) => {
    // 1. Massive CORS allowance so Cloudflare site can access local files securely
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    
    // Handle preflight
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
            const playlist = videoFiles.map(file => `http://127.0.0.1:${PORT}/videos/${encodeURIComponent(file)}`);
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

    if (req.url === '/api/save' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                localData = JSON.parse(body);
                fs.writeFileSync(DATA_FILE, JSON.stringify(localData));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({success: true}));
            } catch(e) {
                res.writeHead(400);
                res.end("Bad Request");
            }
        });
        return;
    }

    // 4. The Video Streamer -> Serves large mp4 files with Proper range support
    if (req.url.startsWith('/videos/')) {
        const decodedUrl = decodeURIComponent(req.url);
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
        // Strip query strings
        safePath = safePath.split('?')[0];
        // Strip leading slashes (critical fix for Windows path.join)
        safePath = safePath.replace(/^\/+/, '');
        // Strip any directory traversal attempts
        safePath = safePath.replace(/\.\.[\/\\]/g, '');
        
        const filePath = path.join(PUBLIC_DIR, safePath);
        
        log(`Static file request: ${req.url} -> ${filePath}`);
        
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const mimeTypes = {
                '.html': 'text/html',
                '.js':   'text/javascript',
                '.css':  'text/css'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            return fs.createReadStream(filePath).pipe(res);
        }
        
        log(`Static file NOT FOUND: ${filePath}`);
    }

    // Default 404
    res.writeHead(404);
    res.end('Not Found');
});

// Create videos directory proactively if missing 
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR);

server.listen(PORT, '0.0.0.0', () => {
    log(`Shadow Video Engine & Offline Hub running on http://localhost:${PORT}`);
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

