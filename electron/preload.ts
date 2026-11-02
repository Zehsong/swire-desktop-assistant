import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { CompanionAPI } from '../src/model';
const api: CompanionAPI = {
  desktop: true,
  collect: (id, projectId, references) =>
    ipcRenderer.invoke('collection:create', id, projectId, references),
  uncollect: (id) => ipcRenderer.invoke('collection:undo', id),
  fileReference: (file) => ({
    label: file.name,
    value: webUtils.getPathForFile(file),
  }),
  windowMode: (mode) => ipcRenderer.invoke('window:mode', mode),
  provider: () => ipcRenderer.invoke('ai:status'),
  chat: (id, text) => ipcRenderer.invoke('ai:chat', id, text),
  cancelChat: (id) => ipcRenderer.invoke('ai:cancel', id),
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
