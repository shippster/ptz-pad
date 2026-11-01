const { contextBridge, ipcRenderer } = require('electron');

// The web app checks for window.ptzNative and, when present, sends every
// camera command through the built-in bridge instead of a separate server.
contextBridge.exposeInMainWorld('ptzNative', {
  version: 6,
  visca: (args) => ipcRenderer.invoke('ptz:visca', args),
  http: (args) => ipcRenderer.invoke('ptz:http', args),
  ndi: (args) => ipcRenderer.invoke('ptz:ndi', args),
  track: {
    start: (args) => ipcRenderer.invoke('track:start', args),
    stop: (id) => ipcRenderer.invoke('track:stop', { id }),
    lock: (id, x, y) => ipcRenderer.send('track:lock', { id, x, y }),
    // Lock (true) or unlock (false) the speaker's shirt colour; x, y also picks a person.
    hold: (id, on, x, y) => ipcRenderer.send('track:lock', { id, hold: on, x, y }),
    config: (id, cfg) => ipcRenderer.send('track:lock', { id, cfg }),
    // Frames from a camera the page opens itself (USB, USB-C, built-in): sent on to the tracker.
    push: (frame) => ipcRenderer.send('track:push', frame),
    onUpdate: (cb) => ipcRenderer.on('track:update', (_e, r) => cb(r)),
  },
  stream: {
    test: (args) => ipcRenderer.invoke('stream:test', args),
  },
});
