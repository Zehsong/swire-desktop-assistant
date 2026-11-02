import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { downloadArtifact } from '@electron/get';
import { extract } from '@electron-internal/extract-zip';

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const installMarker = 'com.swire.companion';
export function safeRelative(value) {
  if (
    !value ||
    value.includes('\\') ||
    /[\x00-\x1f<>:"|?*$]/.test(value) ||
    path.posix.isAbsolute(value) ||
    value
      .split('/')
      .some(
        (s) =>
          !s ||
          s === '.' ||
          s === '..' ||
          /[. ]$/.test(s) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s),
      )
  ) {
    throw new Error('Unsafe package-relative path');
  }
  return value;
}
export async function filesWithin(directory, prefix = '') {
  if (!(await lstat(directory)).isDirectory())
    throw new Error('Package source must be a real directory');
  const files = [];
  const windowsNames = new Set();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const windowsName = entry.name.toUpperCase();
    if (windowsNames.has(windowsName))
      throw new Error('Windows filename collision in package');
    windowsNames.add(windowsName);
    const relative = safeRelative(
      prefix ? `${prefix}/${entry.name}` : entry.name,
    );
    if (entry.isSymbolicLink())
      throw new Error('Package source must not contain symbolic links');
    if (entry.isDirectory())
      files.push(
        ...(await filesWithin(path.join(directory, entry.name), relative)),
      );
    else if (entry.isFile()) files.push(relative);
    else throw new Error('Unsupported package entry');
  }
  return files.sort();
}
async function copyTree(source, destination) {
  for (const relative of await filesWithin(source)) {
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(source, relative), target);
  }
}
export async function stageApp(root, destination) {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version))
    throw new Error('Packaging requires a numeric release version');
  // Renderer dependencies are bundled by Vite; zod is the sole unbundled main-process dependency.
  const expected = ['react', 'react-dom', 'zod'];
  if (
    JSON.stringify(Object.keys(manifest.dependencies).sort()) !==
    JSON.stringify(expected)
  )
    throw new Error(
      'Runtime dependencies changed: review the packaging allowlist first',
    );
  const zod = JSON.parse(
    await readFile(path.join(root, 'node_modules/zod/package.json'), 'utf8'),
  );
  if (Object.keys(zod.dependencies ?? {}).length)
    throw new Error('Zod gained runtime dependencies: review packaging first');
  await readFile(path.join(root, 'dist/index.html'));
  await readFile(path.join(root, 'dist-electron/electron/main.js'));
  await readFile(path.join(root, 'dist-electron/electron/preload.js'));
  await mkdir(destination, { recursive: false });
  const rendererFiles = await filesWithin(path.join(root, 'dist'));
  if (
    rendererFiles.some(
      (f) => !/\.(html|js|css|png|svg|webp|jpe?g|woff2?)$/i.test(f),
    )
  )
    throw new Error('Unexpected renderer output; review before packaging');
  const nativeFiles = [
    'electron/main.js',
    'electron/preload.js',
    'electron/provider.js',
    'electron/store.js',
    'src/model.js',
  ];
  if (
    JSON.stringify(await filesWithin(path.join(root, 'dist-electron'))) !==
    JSON.stringify(nativeFiles)
  )
    throw new Error(
      'Unexpected main-process output; review packaging allowlist',
    );
  await copyTree(path.join(root, 'dist'), path.join(destination, 'dist'));
  await copyTree(
    path.join(root, 'dist-electron'),
    path.join(destination, 'dist-electron'),
  );
  await copyTree(
    path.join(root, 'node_modules/zod'),
    path.join(destination, 'node_modules/zod'),
  );
  await mkdir(path.join(destination, 'licenses'));
  for (const dependency of ['react', 'react-dom']) {
    await copyFile(
      path.join(root, 'node_modules', dependency, 'LICENSE'),
      path.join(destination, 'licenses', `${dependency}-LICENSE`),
    );
  }
  await writeFile(
    path.join(destination, 'package.json'),
    JSON.stringify(
      {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        main: 'dist-electron/electron/main.js',
        type: 'commonjs',
        private: true,
        dependencies: { zod: zod.version },
      },
      null,
      2,
    ),
  );
  return manifest.version;
}
export function uninstallInclude(files) {
  const directories = new Set();
  const lines = [];
  for (const filename of [...new Set(files)].sort()) {
    safeRelative(filename);
    if (['.swire-install', 'Uninstall.exe'].includes(filename)) continue;
    const parts = filename.split('/');
    for (let i = 1; i < parts.length; i++)
      directories.add(parts.slice(0, i).join('/'));
    lines.push(
      'ClearErrors',
      `Delete "$INSTDIR\\${parts.join('\\')}"`,
      'IfErrors 0 +2',
      'StrCpy $UninstallFileErrors "1"',
    );
  }
  for (const dir of [...directories].sort(
    (a, b) => b.split('/').length - a.split('/').length || b.localeCompare(a),
  ))
    lines.push(`RMDir "$INSTDIR\\${dir.replaceAll('/', '\\')}"`);
  const preflight = [];
  [...directories].sort().forEach((dir, i) => {
    const label = `swire_directory_${i}_checked`;
    preflight.push(
      `System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\\${dir.replaceAll('/', '\\')}") i .r0'`,
      `IntCmp $0 -1 ${label}`,
      'IntOp $0 $0 & 0x400',
      `IntCmp $0 0 ${label}`,
      'MessageBox MB_OK|MB_ICONSTOP "An installation directory was replaced by a link. No files have been removed." /SD IDOK',
      'SetErrorLevel 2',
      'Abort',
      `${label}:`,
    );
  });
  return `${[...preflight, ...lines].join('\n')}\n`;
}
export async function prepareWindows(root, output, cacheRoot) {
  const electron = JSON.parse(
    await readFile(
      path.join(root, 'node_modules/electron/package.json'),
      'utf8',
    ),
  );
  const checksums = JSON.parse(
    await readFile(
      path.join(root, 'node_modules/electron/checksums.json'),
      'utf8',
    ),
  );
  const zip = await downloadArtifact({
    version: electron.version,
    artifactName: 'electron',
    platform: 'win32',
    arch: 'x64',
    cacheRoot,
    checksums,
  });
  const payload = path.join(output, 'Swire-win32-x64');
  await mkdir(payload);
  await extract(zip, { dir: payload });
  if (
    (await readFile(path.join(payload, 'version'), 'utf8'))
      .trim()
      .replace(/^v/, '') !== electron.version
  )
    throw new Error('Electron runtime version mismatch');
  await rename(
    path.join(payload, 'electron.exe'),
    path.join(payload, 'Swire.exe'),
  );
  try {
    await rename(
      path.join(payload, 'electron_wer.dll'),
      path.join(payload, 'Swire_wer.dll'),
    );
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await rm(path.join(payload, 'resources/default_app.asar'), { force: true });
  const version = await stageApp(root, path.join(payload, 'resources/app'));
  await writeFile(path.join(payload, '.swire-install'), installMarker);
  const files = await filesWithin(payload);
  const include = path.join(output, 'uninstall-files.nsh');
  await writeFile(include, uninstallInclude(files));
  await writeFile(
    path.join(output, 'package-manifest.json'),
    JSON.stringify(
      {
        appVersion: version,
        electronVersion: electron.version,
        platform: 'win32',
        arch: 'x64',
        files,
      },
      null,
      2,
    ),
  );
  return { payload, version, include };
}
function runCompiler(executable, args) {
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    shell: false,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      'NSIS compilation failed. Install NSIS 3 and put makensis on PATH or set SWIRE_MAKENSIS to its executable.',
    );
}
export async function packageWindows({
  root = repository,
  unpacked = false,
} = {}) {
  // Reject NSIS variable/directive characters in build paths rather than interpreting them.
  if (/[\x00-\x1f$"]/.test(root))
    throw new Error('Build path contains unsupported NSIS characters');
  const compiler = process.env.SWIRE_MAKENSIS || 'makensis';
  const flag = process.platform === 'win32' ? '/' : '-';
  if (!unpacked) {
    const versionCheck = spawnSync(compiler, [`${flag}VERSION`], {
      encoding: 'utf8',
      shell: false,
    });
    if (
      versionCheck.error ||
      versionCheck.status !== 0 ||
      !/^v3\./.test(versionCheck.stdout.trim())
    )
      throw new Error('NSIS 3 is required');
  }
  const release = path.join(root, 'release');
  await mkdir(release, { recursive: true });
  if (!(await lstat(release)).isDirectory())
    throw new Error('Release output must be a real directory');
  const output = await mkdtemp(path.join(release, 'win-'));
  try {
    const { payload, version, include } = await prepareWindows(
      root,
      output,
      process.env.SWIRE_ELECTRON_CACHE,
    );
    if (!unpacked) {
      const installer = path.join(output, `Swire-${version}-Setup.exe`);
      runCompiler(compiler, [
        `${flag}NOCONFIG`,
        `${flag}WX`,
        `${flag}INPUTCHARSET`,
        'UTF8',
        `${flag}DVERSION=${version}`,
        `${flag}DPAYLOAD_DIR=${payload}`,
        `${flag}DOUTPUT_FILE=${installer}`,
        `${flag}DDELETE_INCLUDE=${include}`,
        path.join(root, 'packaging/windows.nsi'),
      ]);
      await readFile(installer);
    }
    console.log(
      `Windows ${unpacked ? 'app directory' : 'installer'} created under ${path.relative(root, output)}`,
    );
    return output;
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.slice(2).some((arg) => arg !== '--unpacked'))
    throw new Error('Only --unpacked is supported');
  packageWindows({ unpacked: process.argv.includes('--unpacked') }).catch(
    () => {
      // Do not print raw network/proxy errors, which can contain credentials.
      console.error(
        'Windows packaging failed. Check NSIS 3, the official Electron download/proxy configuration, and built application inputs. Existing output and user data are not changed.',
      );
      process.exitCode = 1;
    },
  );
}
