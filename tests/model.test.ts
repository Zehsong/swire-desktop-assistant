import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyAction, initialState } from '../src/model';
import { Store } from '../electron/store';
test('project and checkpoint preserve notes and selected references without changing previous state', () => {
  const empty = initialState();
  const project = applyAction(empty, { type: 'project', name: ' Swire ' });
  const state = applyAction(project, {
    type: 'checkpoint',
    input: {
      projectId: project.projects[0].id,
      title: 'First slice',
      notes: 'Next: Windows check',
      references: [{ label: 'Source', value: 'C:\\work\\swire' }],
    },
  });
  assert.equal(empty.projects.length, 0);
  assert.equal(project.checkpoints.length, 0);
  assert.equal(state.projects[0].name, 'Swire');
  assert.equal(state.checkpoints[0].references[0].value, 'C:\\work\\swire');
  assert.equal(state.activity.length, 2);
});
test('rejects orphan checkpoints, empty names, oversized notes and unsafe capture paths', () => {
  assert.throws(() =>
    applyAction(initialState(), { type: 'project', name: '  ' }),
  );
  const s = applyAction(initialState(), { type: 'project', name: 'Test' });
  const input = {
    projectId: s.projects[0].id,
    title: 'Test',
    notes: '',
    references: [],
  };
  assert.throws(() =>
    applyAction(initialState(), { type: 'checkpoint', input }),
  );
  assert.throws(() =>
    applyAction(s, {
      type: 'checkpoint',
      input: { ...input, notes: 'x'.repeat(12001) },
    }),
  );
  assert.throws(() =>
    applyAction(s, {
      type: 'checkpoint',
      input,
      capture: { filename: '../outside.png', source: 'Screen' },
    }),
  );
});
test('messages are personal notes with no fabricated assistant response', () => {
  const state = applyAction(initialState(), {
    type: 'message',
    text: ' Remember this ',
  });
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].text, 'Remember this');
  assert.match(state.activity[0].text, /locally/);
});
test('store persists, keeps a previous backup and refuses to overwrite corrupted data on load', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'swire-test-'));
  try {
    const store = new Store(directory);
    assert.deepEqual(await store.load(), initialState());
    await store.save(initialState());
    const state = applyAction(initialState(), {
      type: 'project',
      name: 'Persistence',
    });
    await store.save(state);
    assert.deepEqual(await new Store(directory).load(), state);
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(directory, 'state.json.bak'), 'utf8'),
      ),
      initialState(),
    );
    await writeFile(path.join(directory, 'state.json'), '{broken');
    await assert.rejects(() => store.load(), /not been overwritten/);
    assert.equal(
      await readFile(path.join(directory, 'state.json'), 'utf8'),
      '{broken',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('oversized reference arrays fail before per-element validation', async () => {
  const { checkpointInput } = await import('../src/model');
  const result = checkpointInput.safeParse({
    projectId: crypto.randomUUID(),
    title: 'Bounded validation',
    notes: '',
    references: Array.from({ length: 31 }, () => ({ label: 0, value: null })),
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, 'too_big');
    assert.deepEqual(result.error.issues[0].path, ['references']);
  }
});
