import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  stageApp,
  filesWithin,
  uninstallInclude,
  safeRelative,
} from '../scripts/package-windows.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'swire-packaging-'));
  const files = {
    'package.json': JSON.stringify({
      name: 'swire-desktop-assistant',
      version: '0.1.0',
      dependencies: { react: '19.3.0', 'react-dom': '19.3.0', zod: '4.6.7' },
      scripts: { secret: 'do not ship' },
    }),
    'dist/index.html': '<html>synthetic</html>',
    'dist/assets/test.js': 'synthetic',
    'node_modules/zod/package.json': JSON.stringify({
      name: 'zod',
      version: '4.6.7',
    }),
    'node_modules/zod/index.cjs': 'module.exports = {};',
    'node_modules/react/LICENSE': 'Synthetic React license fixture',
    'node_modules/react-dom/LICENSE': 'Synthetic React DOM license fixture',
    '.env': 'SYNTHETIC_SECRET_NOT_FOR_PACKAGE',
    'node_modules/unrelated-dev-package/test.js': 'must not ship',
    'tests/private.txt': 'must not ship',
  };
  for (const name of ['main', 'preload', 'provider', 'store'])
    files[`dist-electron/electron/${name}.js`] = 'synthetic';
  files['dist-electron/src/model.js'] = 'synthetic';
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}
test('package stage ships only built app and zod, excludes credentials and development tree', async () => {
  const root = await fixture();
  try {
    const dest = path.join(root, 'stage');
    assert.equal(await stageApp(root, dest), '0.1.0');
    const files = await filesWithin(dest);
    assert.equal(files.length, 12);
    assert.ok(files.includes('licenses/react-LICENSE'));
    assert.ok(files.includes('licenses/react-dom-LICENSE'));
    assert.equal(
      files.some(
        (f) =>
          f.includes('.env') ||
          f.includes('tests/') ||
          f.includes('unrelated-dev-package'),
      ),
      false,
    );
    const manifest = JSON.parse(
      await readFile(path.join(dest, 'package.json'), 'utf8'),
    );
    assert.deepEqual(manifest.dependencies, { zod: '4.6.7' });
    assert.equal(manifest.scripts, undefined);
    await assert.rejects(stageApp(root, dest), { code: 'EEXIST' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('package stage rejects unexpected outputs and changed runtime dependency contracts', async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, 'dist/.env'), 'synthetic');
    await assert.rejects(
      stageApp(root, path.join(root, 'stage')),
      /Unexpected renderer/,
    );
    await rm(path.join(root, 'dist/.env'));
    const manifest = JSON.parse(
      await readFile(path.join(root, 'node_modules/zod/package.json'), 'utf8'),
    );
    manifest.dependencies = { unknown: '1' };
    await writeFile(
      path.join(root, 'node_modules/zod/package.json'),
      JSON.stringify(manifest),
    );
    await assert.rejects(
      stageApp(root, path.join(root, 'stage2')),
      /Zod gained runtime/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('package traversal refuses symbolic links and unsafe Windows/NSIS names', async () => {
  const root = await fixture();
  try {
    await symlink(path.join(root, '.env'), path.join(root, 'dist/leak.js'));
    await assert.rejects(
      stageApp(root, path.join(root, 'stage')),
      /symbolic links/,
    );
    for (const name of [
      '../user.txt',
      'C:/user.txt',
      '/outside',
      'a\\b',
      '$APPDATA/secret',
      'line\nfile',
      'a/CON.txt',
      'a/../b',
      'trailing.',
    ])
      assert.throws(() => safeRelative(name));
    assert.equal(safeRelative('资料/notes.txt'), '资料/notes.txt');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('uninstall manifest removes only shipped files, tracks failures, and never recursively deletes', () => {
  const script = uninstallInclude([
    'Swire.exe',
    'resources/app/package.json',
    '.swire-install',
    'Uninstall.exe',
  ]);
  assert.match(script, /Delete "\$INSTDIR\\Swire.exe"/);
  assert.ok(script.indexOf('GetFileAttributesW') < script.indexOf('Delete '));
  assert.match(script, /StrCpy \$UninstallFileErrors "1"/);
  assert.ok(
    script.indexOf('RMDir "$INSTDIR\\resources\\app"') <
      script.indexOf('RMDir "$INSTDIR\\resources"'),
  );
  assert.doesNotMatch(
    script,
    /RMDir \/r|\$APPDATA|Delete.*\.swire-install|Delete.*Uninstall.exe|RMDir "\$INSTDIR"/,
  );
  assert.throws(() => uninstallInclude(['../outside']));
});

test(
  'case-sensitive host refuses collisions that Windows cannot represent',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await fixture();
    try {
      await writeFile(path.join(root, 'dist/Clash.js'), 'one');
      await writeFile(path.join(root, 'dist/clash.js'), 'two');
      await assert.rejects(
        stageApp(root, path.join(root, 'stage')),
        /Windows filename collision/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
