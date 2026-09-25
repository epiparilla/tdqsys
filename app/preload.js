// Preload: exposes a minimal, safe API to renderer pages served by the local engine.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('afDesktop', {
    // Open the OS file dialog for importing videos (used by settings.html).
    chooseVideos: () => ipcRenderer.invoke('af:chooseVideos'),
    // Path where portable data lives (for diagnostics/UI).
    dataDir: () => ipcRenderer.invoke('af:dataDir'),
    // Override display mode: 'auto' | 'external' | 'preview'
    setDisplayMode: (mode) => ipcRenderer.invoke('af:displayMode', mode)
});