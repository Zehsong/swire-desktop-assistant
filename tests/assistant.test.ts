import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  initialState,
  stateSchema,
  suggestGroups,
} from '../src/model';
import { providerConfig, requestReply } from '../electron/provider';

test('legacy v1 state loads without losing notes and groups default to empty', () => {
  const state = applyAction(initialState(), {
    type: 'message',
    text: 'old note',
  });
  const { collections, ...legacy } = state;
  const loaded = stateSchema.parse(legacy);
  assert.deepEqual(loaded.collections, []);
  assert.equal(loaded.messages[0].text, 'old note');
});
test('collection preview, confirm, idempotency, project isolation and undo affect metadata only', () => {
  let state = applyAction(initialState(), { type: 'project', name: 'A' });
  state = applyAction(state, { type: 'project', name: 'B' });
  const references = suggestGroups([
    { label: 'a.pdf', value: 'C:\\Docs\\a.pdf' },
    { label: 'a.pdf', value: 'c:/docs/a.pdf' },
    { label: 'Link', value: 'https://example.com' },
  ]);
  assert.equal(references.length, 2);
  assert.deepEqual(
    references.map((r) => r.group),
    ['文档', '链接'],
  );
  assert.equal(state.collections.length, 0);
  const action = {
    type: 'collect' as const,
    id: crypto.randomUUID(),
    projectId: state.projects[0].id,
    references,
  };
  const saved = applyAction(state, action);
  assert.equal(saved.collections.length, 1);
  assert.deepEqual(applyAction(saved, action), saved);
  assert.deepEqual(
    applyAction(saved, { ...action, id: crypto.randomUUID() }),
    saved,
  );
  assert.throws(() =>
    applyAction(saved, {
      ...action,
      id: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
    }),
  );
  const other = applyAction(saved, {
    ...action,
    id: crypto.randomUUID(),
    projectId: state.projects[1].id,
  });
  assert.equal(other.collections.length, 2);
  const undone = applyAction(other, { type: 'uncollect', id: action.id });
  assert.equal(undone.collections[0].projectId, state.projects[1].id);
  assert.deepEqual(
    applyAction(undone, { type: 'uncollect', id: action.id }),
    undone,
  );
  assert.equal(state.collections.length, 0);
});
test('provider configuration rejects remote plaintext and URL credentials', () => {
  assert.equal(providerConfig({}), undefined);
  for (const endpoint of [
    'http://remote.test/v1',
    'https://key@example.com/v1',
    'https://example.com/v1?key=secret',
  ])
    assert.equal(
      providerConfig({ SWIRE_AI_ENDPOINT: endpoint, SWIRE_AI_MODEL: 'test' }),
      undefined,
    );
  assert.equal(
    providerConfig({
      SWIRE_AI_ENDPOINT: 'http://127.0.0.1:1234/v1/chat/completions',
      SWIRE_AI_MODEL: 'test',
    })?.model,
    'test',
  );
});
test('mock provider sends only explicit text and validates replies without leaking credentials', async () => {
  const config = {
    endpoint: 'https://example.invalid/chat',
    model: 'test',
    key: 'mock-secret',
  };
  const mock: typeof fetch = async (url, options) => {
    assert.equal(url, config.endpoint);
    assert.equal(options?.redirect, 'error');
    assert.deepEqual(JSON.parse(options!.body as string), {
      model: 'test',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    });
    assert.equal(
      (options!.headers as Record<string, string>).Authorization,
      'Bearer mock-secret',
    );
    return new Response(
      JSON.stringify({ choices: [{ message: { content: 'mock response' } }] }),
    );
  };
  assert.equal(
    await requestReply(config, 'hello', new AbortController().signal, mock),
    'mock response',
  );
  await assert.rejects(
    requestReply(undefined, 'hello', new AbortController().signal, mock),
    /未配置/,
  );
  for (const response of [
    new Response('mock-secret', { status: 401 }),
    new Response('{}'),
    new Response('x'.repeat(256001)),
  ]) {
    await assert.rejects(
      requestReply(
        config,
        'hello',
        new AbortController().signal,
        async () => response,
      ),
      (e) =>
        e instanceof Error &&
        /请求失败/.test(e.message) &&
        !e.message.includes('mock-secret'),
    );
  }
});
test('mock provider abort reports cancellation without returning late output', async () => {
  const controller = new AbortController();
  const promise = requestReply(
    { endpoint: 'https://example.invalid', model: 'test' },
    'hello',
    controller.signal,
    async (_url, options) =>
      new Promise((_resolve, reject) =>
        options!.signal!.addEventListener('abort', () =>
          reject(new Error('mock-secret')),
        ),
      ),
  );
  controller.abort();
  await assert.rejects(promise, /取消或超时/);
});

test('provider error response closes its stream before reporting failure', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    requestReply(
      { endpoint: 'https://example.invalid', model: 'test' },
      'hello',
      new AbortController().signal,
      async () => new Response(body, { status: 500 }),
    ),
    /请求失败/,
  );
  assert.equal(cancelled, true);
});
