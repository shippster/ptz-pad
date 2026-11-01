const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ptzTracker', {
  onFrame: (cb) => ipcRenderer.on('track:frame', (_e, m) => cb(m)),
  onLock: (cb) => ipcRenderer.on('track:lock', (_e, m) => cb(m)),
  onStop: (cb) => ipcRenderer.on('track:stop', (_e, m) => cb(m)),
  result: (r) => ipcRenderer.send('track:result', r),
  ready: (info) => ipcRenderer.send('track:ready', info),
});
