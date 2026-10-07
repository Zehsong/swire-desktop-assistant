import {
  applyAction,
  initialState,
  stateSchema,
  type Action,
  type CompanionAPI,
} from './model';
declare global {
  interface Window {
    swire?: CompanionAPI;
  }
}
const key = 'swire-browser-preview-v1';
const load = () => {
  const raw = localStorage.getItem(key);
  return raw ? stateSchema.parse(JSON.parse(raw)) : initialState();
};
const update = async (action: Action) => {
  const next = applyAction(load(), action);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
};
export const api: CompanionAPI = window.swire ?? {
  desktop: false,
  load: async () => load(),
  project: (name) => update({ type: 'project', name }),
  checkpoint: (input) => update({ type: 'checkpoint', input }),
  message: (text) => update({ type: 'message', text }),
  settings: (settings) => update({ type: 'settings', settings }),
  pickFiles: async () => {
    throw new Error('File selection requires the desktop app.');
  },
  previewCapture: async () => {
    throw new Error('Screen capture requires the desktop app.');
  },
  cancelCapture: async () => {},
  readCapture: async () => {
    throw new Error('Captures are stored in the desktop app.');
  },
};
