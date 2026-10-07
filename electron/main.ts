import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  desktopCapturer,
  session,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { Store } from './store';
import {
  applyAction,
  checkpointInput,
  type Action,
  type State,
} from '../src/model';
app.setName('Swire');
if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);
let window: BrowserWindow;
app.on('second-instance', () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
app.on('window-all-closed', () => app.quit());
async function start() {
  const store = new Store(app.getPath('userData'));
  const captureDir = path.join(store.directory, 'captures');
  const pending = new Map<string, { png: Buffer; name: string }>();
  let captureGeneration = 0;
  let captureExpires = 0;
  let captureTimer: ReturnType<typeof setTimeout> | undefined;
  const clearPending = () => {
    captureGeneration++;
    pending.clear();
    clearTimeout(captureTimer);
  };
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const task = queue.then(work);
    queue = task.catch(() => {});
    return task;
  };
  const mutate = async (action: Action): Promise<State> => {
    const next = applyAction(await store.load(), action);
    await store.save(next);
    return next;
  };
  const url =
    app.isPackaged || process.env.SWIRE_DEV !== '1'
      ? pathToFileURL(path.join(__dirname, '../../dist/index.html')).href
      : 'http://127.0.0.1:5173/';
  window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#111518',
    title: 'Swire · Desktop companion',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on('did-start-navigation', clearPending);
  window.on('closed', clearPending);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed =
      details.url.startsWith('file://') ||
      details.url.startsWith('data:image/png;base64,') ||
      (!app.isPackaged &&
        process.env.SWIRE_DEV === '1' &&
        /^(http|ws):\/\/127\.0\.0\.1:5173\//.test(details.url));
    callback({ cancel: !allowed });
  });
  const handle = (channel: string, work: (...args: any[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== url
      )
        throw new Error('Untrusted request');
      return work(...args);
    });
  handle('state:load', () => serialized(() => store.load()));
  handle('project:create', (name) =>
    serialized(() => mutate({ type: 'project', name })),
  );
  handle('message:create', (text) =>
    serialized(() => mutate({ type: 'message', text })),
  );
  handle('settings:update', (settings) =>
    serialized(async () => {
      const state = await mutate({ type: 'settings', settings });
      window.setAlwaysOnTop(state.settings.alwaysOnTop);
      return state;
    }),
  );
  handle('files:pick', async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled
      ? []
      : result.filePaths
          .slice(0, 30)
          .map((value) => ({ label: path.basename(value), value }));
  });
  handle('capture:preview', async () => {
    const generation = ++captureGeneration;
    pending.clear();
    clearTimeout(captureTimer);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1600, height: 1000 },
    });
    if (generation !== captureGeneration) return [];
    captureExpires = Date.now() + 10 * 60 * 1000;
    captureTimer = setTimeout(clearPending, 10 * 60 * 1000);
    captureTimer.unref();
    return sources
      .filter((source) => !source.thumbnail.isEmpty())
      .map((source) => {
        const token = randomUUID();
        pending.set(token, {
          png: source.thumbnail.toPNG(),
          name: source.name,
        });
        return {
          token,
          name: source.name,
          image: source.thumbnail.toDataURL(),
        };
      });
  });
  handle('capture:cancel', clearPending);
  handle('checkpoint:create', (raw, token) =>
    serialized(async () => {
      const input = checkpointInput.parse(raw);
      const state = await store.load();
      let capture: { filename: string; source: string } | undefined;
      let capturePng: Buffer | undefined;
      if (token !== undefined) {
        z.string().uuid().parse(token);
        const selected = pending.get(token);
        if (!selected || Date.now() > captureExpires)
          throw new Error('Capture expired. Please preview again.');
        capture = { filename: `${randomUUID()}.png`, source: selected.name };
        capturePng = selected.png;
      }
      const next = applyAction(state, { type: 'checkpoint', input, capture });
      try {
        if (capture) {
          await mkdir(captureDir, { recursive: true });
          await writeFile(
            path.join(captureDir, capture.filename),
            capturePng!,
            { mode: 0o600 },
          );
        }
        await store.save(next);
      } catch (error) {
        if (capture)
          await unlink(path.join(captureDir, capture.filename)).catch(() => {});
        throw error;
      }
      clearPending();
      return next;
    }),
  );
  handle('capture:read', async (filename) => {
    z.string()
      .regex(/^[a-f0-9-]+\.png$/)
      .parse(filename);
    const state = await store.load();
    if (!state.checkpoints.some((c) => c.capture?.filename === filename))
      throw new Error('Unknown capture');
    return `data:image/png;base64,${(await readFile(path.join(captureDir, filename))).toString('base64')}`;
  });
  try {
    window.setAlwaysOnTop((await store.load()).settings.alwaysOnTop);
  } catch {
    /* Renderer presents a recoverable storage error. */
  }
  await window.loadURL(url);
}
