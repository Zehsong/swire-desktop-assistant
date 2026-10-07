# Swire / 施怀雅

A first useful Windows desktop companion: a calm, local place for work context. Original dark tactical panels, geometric framing and restrained yellow accents evoke the requested Arknights/Endfield direction without copying either game's interface or artwork. The emblem is an original CSS placeholder.

![Browser preview with synthetic test data](docs/workspace-preview.png)

## Run on Windows

Use Windows 10/11 x64 and Node.js 22.12+ (Node 24 LTS recommended), with npm. From the repository in PowerShell:

```powershell
npm ci
npm run dev
```

The development command compiles the Electron main/preload processes, starts Vite on `127.0.0.1:5173`, then launches Electron. Renderer edits update live; restart the command after main/preload edits. The Electron download comes from its official GitHub releases. If your npm configuration suppresses dependency install scripts, run `node node_modules/electron/install.js` after installation. Do not disable application sandboxing on Windows.

Run the production build locally:

```powershell
npm run build
npm start
```

Create a local, unsigned Windows NSIS installer (not a publish operation):

```powershell
npm run dist:win
```

Installer output is under `release/`. This packaging configuration has **not** been validated on Windows. Code signing, auto-update, startup registration and distribution are not included. Nothing in these commands pushes or publishes the repository; packaging explicitly uses `--publish never`.

For UI development without Electron, `npm run dev:web` opens a browser preview at http://127.0.0.1:5173. Browser preview data uses a separate localStorage database; it is not synchronized to desktop data. Native features are visibly disabled.

## Working features

- Create named projects and switch between their checkpoint timelines.
- Manually save checkpoints with titles, notes, and up to 30 selected resource references. Native file selection records paths only; it does not read the files. Typed paths/URLs are plain text and are not automatically opened.
- An explicit screen capture button requests one still preview per screen. Select a preview, remove it, cancel, or save it with a checkpoint. There is no monitoring, stream, scheduled capture, audio or automatic upload. Previews are bounded by Electron's requested 1600×1000 thumbnail size, not full-resolution archival screenshots; actual dimensions vary by display scaling.
- Selected screenshots are written only when saving the checkpoint and can be viewed from the timeline. Unsaved captures are cleared on cancellation, navigation, window close or after ten minutes. Cancelling the capture picker preserves the checkpoint draft; closing the whole checkpoint dialog discards the draft.
- The companion channel saves personal notes, explicitly marked **AI provider not connected**. It does not generate or fabricate assistant replies. Recent 1,000 notes are retained.
- Customize the companion's name, compact spacing and native always-on-top behavior.
- View the latest 500 successful save actions in the activity log.
- Validated local persistence, atomic state replacement, a previous-state backup and visible storage error handling. Unsaved form drafts are not persisted.

This is a companion **panel**, not an animated avatar, tray agent or autonomous assistant. Provider setup, credential storage, AI chat, deletion/editing of saved checkpoints, search, encryption and synchronization are not implemented. A future provider integration must require setup and explicit sending consent before transmitting any user content.

## Storage, backup and recovery

Desktop state is under Electron's `app.getPath('userData')`: normally `%APPDATA%\Swire` on Windows. Development builds may use `%APPDATA%\swire-desktop-assistant`, depending on Electron's application path resolution. Files:

- `state.json`: versioned projects, checkpoints, notes, settings and bounded activity history.
- `state.json.bak`: state immediately before the most recent successful write (not a complete backup history).
- `captures/`: locally saved PNG images referenced by checkpoints.

Close Swire and copy the whole folder to back up, including `captures/`. To restore, close the app and replace the folder with your backup. If `state.json` is unreadable or fails schema validation, the app shows an error and refuses to silently reset it. Preserve the failing file first, then replace it with a known-good backup or `state.json.bak`, and relaunch. Do not edit state files while the app is running. To intentionally reset all data, back up and remove the folder while Swire is closed. Browser preview data can be reset through the browser's site-storage controls.

Local data is not encrypted. References can expose paths and captures can contain sensitive content. Review images before saving. No user data is sent to an AI provider; none is integrated. Production renderer network requests are blocked. Development mode permits only the local Vite endpoint. Dependency installation and packaging may download tooling, but those operations do not involve saved user content.

## Architecture

- `src/main.tsx`, `src/style.css`: React UI and original visual system. Native dialogs trap focus, support Escape and preserve drafts after save failures.
- `src/model.ts`: Zod schemas, limits, immutable state transitions and the narrow bridge contract. State uses format version 1; unknown versions fail closed instead of being overwritten.
- `src/api.ts`: desktop bridge selection and explicitly labeled browser-only persistence adapter.
- `electron/main.ts`: native window, validated IPC sender, serialized mutations, file picker, explicit capture lifecycle and network/permission denial. Only the app's main frame may call IPC. User-controlled paths never get passed to a shell.
- `electron/preload.ts`: a fixed set of contextBridge methods, no raw IPC exposure. Node integration is off; context isolation and renderer sandbox are on.
- `electron/store.ts`: schema-checked JSON persistence through a temporary file, backup and rename. This is a small single-user store, not an encrypted database or multi-process synchronization layer. The application takes a single-instance lock.
- `tests/`: model/store tests and browser interaction tests, including a clearly simulated desktop-bridge capture contract test.

Security choices follow [Electron's security checklist](https://www.electronjs.org/docs/latest/tutorial/security/); capture uses the official [desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer).

## Validation

```powershell
npm run format:check
npm run build
npm test
npx playwright install chromium
npm run test:ui
```

`build` includes strict TypeScript checks for both renderer and main process. UI tests cover creating a project and checkpoint, references, note persistence across reloads, settings, timeline, activity, cancelling drafts, save failures and the preview/cancel/commit interaction contract. The capture-contract test injects a simulated desktop bridge; it does **not** verify Electron IPC or screen capture.

In a Linux environment with Chromium already installed:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

The optional `CHROMIUM_PATH` test override uses `--no-sandbox` for restricted CI browsers only. It never changes the desktop application's sandbox configuration. Screenshots are generated under ignored `test-results/`.

### Windows acceptance checklist — still required

1. Run the production app with `npm run build` and `npm start`. Confirm it identifies as desktop, not browser preview; create projects, local notes and checkpoints, restart and verify persistence.
2. Select a real file, cancel the picker, select multiple files and verify only names/paths are stored. Test non-ASCII names and Windows paths with spaces.
3. With two displays and mixed DPI scaling, preview capture, inspect both images, cancel and confirm no PNG was written. Preview again, select one image, save and view it after restart. Verify removal, expiry, permissions/unavailable-screen errors and no background capture. OS-protected content may yield blank previews.
4. Toggle always-on-top and restart. Verify focus, minimize/restore, resizing at 100%, 125%, 150% and 200% scaling, keyboard traversal, Escape and the native titlebar. Launch twice and confirm the original window is focused.
5. Exercise a read-only/full storage location and corrupted state. Verify clear errors, preserved drafts and backup recovery, without resetting existing data.
6. Build/install the NSIS output as a standard user, launch it offline, verify desktop IPC and capture again, and test upgrade/uninstall behavior. No Windows installer has been built or executed in the cloud run.

Linux/browser checks cannot establish Windows capture, always-on-top, installer, display scaling or native integration correctness.
