# Cloud validation — 2026-10-07

Environment: Linux, Node 24.19.0, npm 11.9.0, system Chromium. Empty checkout; implementation created on `feat/windows-companion`.

| Check                                             | Result                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                            | Passed                                                                                                                              |
| `npm run build`                                   | Passed: strict TypeScript, Vite renderer bundle, Electron main/preload compilation                                                  |
| `npm test`                                        | 4/4 passed: state transitions, invalid input, honest local notes, disk persistence/backup/corruption                                |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` | 4/4 passed: full workflow/reload, draft cancellation, simulated capture preview/cancel/expiry/commit, save failure preserving draft |
| `npm audit --omit=dev`                            | 0 production dependency vulnerabilities reported                                                                                    |
| Visual inspection                                 | Inspected the 1440px browser workflow screenshot; saved as `docs/workspace-preview.png` with synthetic test data                    |
| Native Linux launch                               | Not validated: headless Electron exited with code 139 amid display/GPU initialization errors; no X display or Xvfb was available    |
| Windows runtime / NSIS installer                  | Not run in this Linux environment                                                                                                   |

The Electron binary initially failed to download because Node's download path was not using the environment proxy. Retrying the official installer with `NODE_USE_ENV_PROXY=1` and a writable temporary cache completed the download. This did not resolve the missing desktop display environment.

The browser capture test uses a simulated bridge and cannot validate native IPC, capture permissions or desktop APIs. No real screen capture, native file picker, always-on-top behavior or Windows installer correctness is claimed. Complete the Windows acceptance checklist in the README before treating those integrations as validated. No push, publication, deployment or merge was performed.
