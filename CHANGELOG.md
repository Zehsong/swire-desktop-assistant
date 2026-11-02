# Changelog

## Dependency security repair — 2026-11-02

- Updated Electron within major 44 to 44.10.1, concurrently to 10.0.6 (shell-quote 1.12.0), and Zod to 4.6.7. Applied compatible lockfile patches for undici 6/7, joi, follow-redirects and fast-uri.
- Cloud audit changed from 2 critical / 7 high / 20 moderate to 0 critical / 0 high / 15 moderate. Remaining minimatch propagation has no compatible same-major patch; no force fix or breaking override was applied.
- Added bounded-array validation regression; clean install, format, types/build, 12 unit and 8 browser tests passed. Electron binary download failed in cloud; native tests remain outstanding.
- See [dependency review](docs/security/2026-11-02-dependencies.md) and raw audit snapshots for attribution, compatibility, residual risk and local testing conditions. This repair is local only pending separate publication authorization.

## Local delivery review — 2026-11-02

- Reviewed the AI input/IPC/request boundary and main-process-only credential handling; found no new in-scope production defects.
- Added an on-disk legacy-state regression covering grouping, cross-project undo, restart, backup, unchanged referenced-file contents and unsupported-version rejection.
- Added a simulated renderer/bridge regression proving explicit AI input excludes saved paths/notes and dropped-file contents, with no file reads or chat persistence.
- Validation: 11 unit tests, 8 Chromium browser tests, formatting, renderer/main-process TypeScript and production build passed locally. No real provider requests, secret inspection, uploads, pushes, PRs or deployments were performed. Windows native validation remains outstanding.

## Phase 1 companion — 2026-11-02

- Added a collapsible assistant entry and native small-window/minimize/workbench controls; retained the existing workbench and original placeholder emblem.
- Added file/link collection, editable local-rule grouping previews, explicit confirmation, per-project deduplication and metadata-only batch undo. Legacy v1 state defaults missing collections without losing existing data.
- Added a main-process configurable, non-streaming OpenAI-compatible adapter with environment-only credentials, explicit text sending, cancellation, timeout, response limits and sanitized errors. No real provider was called.
- Added truthful busy/confirmation states, quiet guidance and explicit browser/native limitations. AI conversation is ephemeral and separate from persistent notes.
- Validated on Linux: 10 unit tests and 7 Chromium browser tests, including original workflows; inspected the narrow companion screenshot. Windows native behavior and installer remain unverified.
- Cleanup, performance diagnosis, synchronization, official character artwork and autonomous actions are not included.

## 0.1.0 — 2026-10-07

- Established an Electron, React and TypeScript Windows-targeted application from an empty checkout.
- Added an original tactical command desk with companion placeholder, project navigation, checkpoint timeline, local notebook, activity log and settings.
- Added manual checkpoint notes and resource references, desktop file selection, explicit capture preview/cancel/save/view, and always-on-top preferences.
- Added schema validation, serialized desktop writes, atomic local state replacement and previous-state backup.
- Kept AI explicitly disconnected; no generated replies, content transmission or continuous monitoring.
- Added a separately labeled browser preview, model/store tests, browser workflow tests, Windows packaging configuration and native acceptance checklist.
- Windows packaging, capture and native behavior remain unverified by the Linux cloud run.
