'use strict';
// TDQSYS Licence Authority GUI - Main Process
// Handles key generation, licence issuance, verification, and key management.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

// Load the local licence core (self-contained, no external dependencies)
const appPath = app.getAppPath();
let license;
const tryPaths = [
  path.join(appPath, 'license-core.js'),
  path.join(__dirname, 'license-core.js'),
  path.join(process.resourcesPath, 'app.asar', 'license-core.js'),
  path.join(process.resourcesPath, 'license-core.js')
];
for (const p of tryPaths) {
  try {
    license = require(p);
    break;
  } catch (e) {
    continue;
  }
}
if (!license) {
  console.error('Failed to load license-core.js from all paths:', tryPaths);
  throw new Error('Cannot find module license-core.js');
}

const KEY_DIR = path.join(app.getPath('home'), '.tdqsys');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'private.pem');
const LICENCE_DIR = path.join(KEY_DIR, 'licences');

function ensureKeyDir() {
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
  if (!fs.existsSync(LICENCE_DIR)) fs.mkdirSync(LICENCE_DIR, { recursive: true });
}

function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) return null;
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'));
}

function getPublicKeyPem(privateKey) {
  return crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
}

function buildCode(payload, privateKey) {
  return license.buildCode(payload, (bytes) => crypto.sign(null, bytes, privateKey));
}

function verifyCode(code, trustedKeys) {
  return license.licenseStatus(code, { instanceId: '', now: Date.now(), keys: trustedKeys });
}

// IPC Handlers
ipcMain.handle('keygen', async () => {
  ensureKeyDir();
  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    return { ok: false, error: 'Private key already exists at ' + PRIVATE_KEY_PATH };
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubPem = getPublicKeyPem(publicKey);
  fs.writeFileSync(PRIVATE_KEY_PATH, privPem, { mode: 0o600 });
  try { fs.chmodSync(PRIVATE_KEY_PATH, 0o600); } catch { /* Windows ignores */ }
  return { ok: true, publicKey: pubPem, privateKeyPath: PRIVATE_KEY_PATH };
});

ipcMain.handle('get-public-key', async () => {
  const pk = loadPrivateKey();
  if (!pk) return { ok: false, error: 'No private key found. Run keygen first.' };
  return { ok: true, publicKey: getPublicKeyPem(pk) };
});

ipcMain.handle('issue-licence', async (_, args) => {
  const privateKey = loadPrivateKey();
  if (!privateKey) return { ok: false, error: 'No private key. Run keygen first.' };

  const { instanceId, customer, site, from, until, keyId } = args;
  if (!instanceId) return { ok: false, error: 'Instance ID required' };
  if (!/^[0-9a-fA-F-]{1,64}$/.test(instanceId)) return { ok: false, error: 'Invalid instance ID' };
  if (!from || !until) return { ok: false, error: 'From and until dates required' };

  const payload = {
    v: license.PAYLOAD_VERSION,
    i: String(instanceId).toLowerCase(),
    c: customer || site || 'Licensed location',
    b: from,
    x: until,
    n: crypto.randomBytes(6).toString('hex'),
    k: keyId || 'k1'
  };

  const code = buildCode(payload, privateKey);
  return { ok: true, code, payload };
});

ipcMain.handle('verify-licence', async (_, code) => {
  if (!code || !code.trim()) return { ok: false, error: 'No code provided' };
  const trusted = license.TRUSTED_PUBLIC_KEYS || [];
  try {
    const parts = code.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'TDQS1') {
      return { ok: false, error: 'Invalid code format' };
    }
    const payloadBytes = Buffer.from(parts[1], 'base64url');
    const payload = JSON.parse(zlib.inflateRawSync(payloadBytes).toString('utf8'));
    const keyId = payload.k;
    const trustedKey = trusted.find(k => k.keyId === keyId);
    if (!trustedKey) {
      return { ok: false, payload, error: `Key ${keyId} not trusted`, trusted: false };
    }
    const signature = Buffer.from(parts[2], 'base64url');
    const valid = crypto.verify(null, payloadBytes, trustedKey.pem, signature);
    return { ok: true, payload, valid, keyId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('read-request', async (_, filePath) => {
  try {
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ok: true, request: doc };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('list-keys', async () => {
  const pk = loadPrivateKey();
  if (!pk) return { ok: false, error: 'No private key' };
  return { ok: true, publicKey: getPublicKeyPem(pk), keyPath: PRIVATE_KEY_PATH };
});

ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('save-dialog', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return { canceled: result.canceled, filePath: result.filePath };
});

ipcMain.handle('open-dialog', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return { canceled: result.canceled, filePaths: result.filePaths };
});

// Main window
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'TDQSYS Licence Authority',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (line ${line} in ${sourceId})`);
  });
  mainWindow.webContents.on('crashed', () => {
    console.log('[renderer] crashed');
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.log('[renderer] process gone:', details);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});