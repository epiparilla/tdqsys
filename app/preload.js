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
    // Open a URL in the default browser (used by the download-update button).
    openExternal: (url) => ipcRenderer.invoke('af:openExternal', url),
    // Subscribe to background update-available events pushed by the main process.
    onUpdateAvailable: (cb) => ipcRenderer.on('af:update-available', (_e, info) => cb(info))
});