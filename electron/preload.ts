import { contextBridge, ipcRenderer } from 'electron';
import type { CompanionAPI } from '../src/model';
const api: CompanionAPI = {
  desktop: true,
  load: () => ipcRenderer.invoke('state:load'),
  project: (name) => ipcRenderer.invoke('project:create', name),
  checkpoint: (input, token) =>
    ipcRenderer.invoke('checkpoint:create', input, token),
  message: (text) => ipcRenderer.invoke('message:create', text),
  settings: (settings) => ipcRenderer.invoke('settings:update', settings),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  previewCapture: () => ipcRenderer.invoke('capture:preview'),
  cancelCapture: () => ipcRenderer.invoke('capture:cancel'),
  readCapture: (filename) => ipcRenderer.invoke('capture:read', filename),
};
contextBridge.exposeInMainWorld('swire', api);
