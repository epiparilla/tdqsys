// Preload: exposes a minimal, safe API to renderer pages served by the local engine.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('afDesktop', {
    // Open the OS file dialog for importing videos (used by settings.html).
    chooseVideos: () => ipcRenderer.invoke('af:chooseVideos'),
    // Path where portable data lives (for diagnostics/UI).
    dataDir: () => ipcRenderer.invoke('af:dataDir'),
    // Override display mode: 'auto' | 'external' | 'preview'
    setDisplayMode: (mode) => ipcRenderer.invoke('af:displayMode', mode),
    // Software updates: check the hosted version.json and compare to app version.
    checkUpdates: () => ipcRenderer.invoke('af:checkUpdates'),
    // Hot update: download the installer in-app, install silently, restart on
    // the new version (no browser). Progress comes via onUpdateProgress().
    installUpdate: () => ipcRenderer.invoke('af:installUpdate'),
    // Subscribe to in-app update progress/state pushed during the install.
    onUpdateProgress: (cb) => ipcRenderer.on('af:update-progress', (_e, info) => cb(info)),
    // Open a URL in the default browser (misc external links).
    openExternal: (url) => ipcRenderer.invoke('af:openExternal', url),
    // App metadata: install mode / version / data dir / uninstaller existence.
    appInfo: () => ipcRenderer.invoke('af:appInfo'),
    // Backup the whole queue state (data.json + videos) into a user-chosen .zip.
    backupData: () => ipcRenderer.invoke('af:backupData'),
    // Restore a backup .zip over the current data dir and reload the engine.
    restoreData: () => ipcRenderer.invoke('af:restoreData'),
    // Launch the NSIS uninstaller and quit (installed builds only).
    uninstallApp: () => ipcRenderer.invoke('af:uninstallApp'),
    // Subscribe to background update-available events pushed by the main process.
    onUpdateAvailable: (cb) => ipcRenderer.on('af:update-available', (_e, info) => cb(info))
});