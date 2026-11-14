/**
 * Preload — the only bridge between the sandboxed renderer and Node/Electron.
 * Exposes a small, explicit API as `window.purelab`. No Node primitives leak.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('purelab', {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getHubInfo: () => ipcRenderer.invoke('hub:info'),
  regenerateHubToken: () => ipcRenderer.invoke('hub:regenerate-token'),
  setHubEnabled: (enabled) => ipcRenderer.invoke('hub:set-enabled', !!enabled),
  /** @param {{ pageSize: 'A4' | {width:number,height:number}, fileName: string }} opts */
  printToPDF: (opts) => ipcRenderer.invoke('print:pdf', opts),
  print: (opts) => ipcRenderer.invoke('print:direct', opts || {}),
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  saveBackup: (json, fileName) => ipcRenderer.invoke('backup:save', { json, fileName }),
});
