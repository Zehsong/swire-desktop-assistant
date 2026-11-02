# Packaging migration and final dependency audit — 2026-11-02

This supersedes the residual-risk conclusion in the [first dependency repair](2026-11-02-dependencies.md), whose raw audit snapshots remain historical evidence. The user authorized the necessary packaging migration and a fast-forward branch push after validation, with no public release or service deployment.

## Result and scope

The complete `npm audit --json` now reports **0 critical, 0 high, 0 moderate, 0 low**. [Final raw audit](audit-final.json). The locally generated installer has a recorded [size, SHA-256 and validation summary](packaging-validation.json); it has not been publicly published. No audit threshold, advisory exclusion, forced override, or disabled security check was used. Zero current registry findings is not a guarantee against unknown defects or vulnerabilities in external compilers or OS components.

The prior 15 moderate entries all propagated from minimatch through electron-builder. Latest electron-builder 26.18.0 still included old minimatch/asar; isolated checks of latest asar 4.3.1, Electron Packager 20.3.0 and Forge core 8.0.1 also retained audited dependencies. We therefore replaced electron-builder with a small Node staging script and the separately installed **NSIS 3** compiler, while preserving an unsigned Windows x64 installer, directory selection, Start Menu entry and uninstall support.

Electron explicitly supports distributing a built app in `resources/app` without an asar archive. The script downloads the exact Electron version installed from the lockfile, verifies the official npm package's embedded ZIP checksum through `@electron/get`, extracts it with Electron's own extractor, and verifies the runtime version. [Official manual packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution).

## Safety and behavior changes

- No minimatch, glob or electron-builder remains in the installed dependency tree. Direct tooling dependencies are `@electron/get` and `@electron-internal/extract-zip`, already used by Electron; npm dependencies stay locked and audited.
- Staging copies only Vite output, an explicit set of compiled main/preload modules, the installed Zod runtime, bundled React license notices, and a minimal package manifest. Renderer React is bundled. Changed runtime dependency contracts or unexpected build files fail closed instead of silently adding arbitrary files. Source credentials, tests, caches and unrelated node_modules are excluded.
- Symbolic links, Windows case collisions and unsafe Windows/NSIS path names are rejected. Every build gets a new output folder; existing outputs are not overwritten. A failed build cleans only its own newly created directory. Paths and credentials are not added to the package manifest or error reports.
- Installer runs for the current user without elevation, checks x64 Windows, and requires a new or empty directory. Upgrades require uninstalling the old build first; an old electron-builder installation may have a different registration key, so users must uninstall it explicitly. The new installer never empties an existing folder for them.
- Uninstall verifies an exact application marker and rejects linked installation directories. It deletes only the files recorded at build time, never recursively deletes the installation root, and preserves user-added files and AppData. Locked shipped files leave the uninstaller/registration available for retry. [NSIS scripting reference](https://nsis.sourceforge.io/Docs/Chapter4.html).
- App name, data model and user-data behavior are unchanged. EXE file name is Swire.exe, but the Electron binary's stock icon/PE product metadata remains; there is no code signing, auto-update or public-release integration.

## Installation, runtime and packaging validation

A fresh `npm ci` installed 112 packages with no deprecation warnings. This verifies npm package installation, **not** the presence of an Electron executable: the installed Electron package has no postinstall lifecycle hook. `npm run runtime:install` explicitly runs its official installer.

The earlier cloud `fetch failed` limitation was resolved by opting into the official downloader's proxy support with `ELECTRON_GET_USE_PROXY=true`; checksum and TLS verification stayed enabled. With the already configured environment proxy, both official Windows x64 and Linux x64 Electron archives downloaded and verified successfully. No proxy credentials were read or recorded in this report. A Linux `ELECTRON_RUN_AS_NODE` execution reported Electron **44.10.1**, Node **24.22.1** and embedded undici **7.30.1**. This verifies a real runtime executable, not just package.json.

Validation against the final source:

- Full npm audit: zero; production-only audit: zero.
- Formatting, renderer/main-process TypeScript, production build and package-boundary tests passed.
- 17 unit/package tests and 8 Chromium browser tests passed. Tests cover staged-file allowlisting, exclusion of secrets/dev files, rejection of symlinks/unsafe names/case collisions, non-overwrite behavior and precise uninstall commands, alongside existing app/persistence/AI mock tests.
- Real Windows x64 payload generated from checksum-verified Electron, including Zod; packaged model loaded successfully under Node as an additional dependency/layout smoke check.
- NSIS 3.12 compiled the final real payload with warnings treated as errors. A separate small compile covered Unicode and space-containing build paths. The installer was generated locally only, not executed or published.

**Still required on Windows:** launch the packaged app, check existing user data, file selection/drop/capture/always-on-top, install into a new and an existing empty folder, reject nonempty/linked folders, correct an invalid directory selection and check the final success exit code, test uninstall while running and after close, retain user-added files and AppData, and test uninstall-before-upgrade. Linux compile/browser success is not Windows installation acceptance. The separate local-machine task owns those checks; no real AI provider is used here.
