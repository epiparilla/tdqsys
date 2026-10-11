'use strict';
// Preload script for TDQSYS Licence Authority GUI
// Exposes safe IPC APIs to the renderer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseAPI', {
  keygen: () => ipcRenderer.invoke('keygen'),
  getPublicKey: () => ipcRenderer.invoke('get-public-key'),
  issueLicence: (args) => ipcRenderer.invoke('issue-licence', args),
  verifyLicence: (code) => ipcRenderer.invoke('verify-licence', code),
  readRequest: (filePath) => ipcRenderer.invoke('read-request', filePath),
  listKeys: () => ipcRenderer.invoke('list-keys'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showSaveDialog: (options) => ipcRenderer.invoke('save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('open-dialog', options),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', { filePath }),
});