import { test, expect } from '@playwright/test';
const project = async (page: import('@playwright/test').Page, name: string) => {
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .first()
    .click();
  await page.getByLabel('Project name').fill(name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
};
test('collect drop, preview, cancel, switch project, dedupe, persist and undo', async ({
  page,
}) => {
  await page.goto('/');
  await project(page, 'Alpha');
  await project(page, 'Beta');
  await page.getByRole('button', { name: 'S/ 施怀雅' }).click();
  await expect(page.getByRole('button', { name: '发送给 AI' })).toBeDisabled();
  await page.getByLabel('收集链接').fill('https://example.com/paper');
  await page.getByRole('button', { name: '加入收集箱' }).click();
  await page.getByRole('button', { name: '预览整理方案' }).click();
  await page.getByRole('button', { name: '取消方案' }).click();
  await expect(page.getByRole('button', { name: '撤销这批归组' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '预览整理方案' }).click();
  await page.getByLabel('归组项目').selectOption({ label: 'Beta' });
  await expect(page.getByRole('region', { name: '整理方案预览' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '预览整理方案' }).click();
  await expect(page.getByText('确认归入：Beta')).toBeVisible();
  await page.getByRole('button', { name: '确认归组' }).click();
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData('text/uri-list', 'https://example.com/paper');
    return d;
  });
  await page
    .getByRole('region', { name: '施怀雅助手', exact: true })
    .dispatchEvent('drop', { dataTransfer: dt });
  await page.getByRole('button', { name: '预览整理方案' }).click();
  await page.getByRole('button', { name: '确认归组' }).click();
  await expect(page.getByRole('button', { name: '撤销这批归组' })).toHaveCount(
    1,
  );
  const files = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File(['synthetic'], 'notes.pdf', {
        type: 'application/pdf',
        lastModified: 123,
      }),
    );
    return d;
  });
  await page
    .getByRole('region', { name: '施怀雅助手', exact: true })
    .dispatchEvent('drop', { dataTransfer: files });
  await page.getByRole('button', { name: '预览整理方案' }).click();
  await expect(page.getByLabel('分组 notes.pdf')).toHaveValue('文档');
  await page.getByRole('button', { name: '确认归组' }).click();
  await page.getByRole('button', { name: '桌面小窗' }).click();
  await page.setViewportSize({ width: 420, height: 740 });
  await page.getByRole('button', { name: '跳到对话' }).click();
  await expect(page.getByLabel('发给 AI 的文字')).toBeInViewport();
  await page.screenshot({
    path: 'test-results/assistant-chat.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '收集与整理' }).click();
  await page.screenshot({ path: 'test-results/assistant.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'S/ 施怀雅' }).click();
  await page.getByLabel('归组项目').selectOption({ label: 'Beta' });
  await expect(page.getByRole('button', { name: '撤销这批归组' })).toHaveCount(
    2,
  );
  await page.getByRole('button', { name: '撤销这批归组' }).first().click();
  await expect(page.getByRole('button', { name: '撤销这批归组' })).toHaveCount(
    1,
  );
});
test('simulated AI bridge: failure preserves draft, cancel discards late answer and retry works', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    (window as any).swire = {
      desktop: true,
      load: async () => ({
        version: 1,
        projects: [],
        checkpoints: [],
        messages: [],
        collections: [],
        activity: [],
        settings: { name: 'Swire', compact: false, alwaysOnTop: false },
      }),
      provider: async () => ({
        configured: true,
        model: 'mock',
        endpoint: 'https://example.invalid',
      }),
      chat: async () => {
        calls++;
        if (calls === 1) throw new Error('mock failure');
        if (calls === 2)
          return new Promise((resolve) => {
            (window as any).__reply = resolve;
          });
        return new Promise((resolve) => {
          (window as any).__retryReply = resolve;
        });
      },
      cancelChat: async () =>
        new Promise<void>((resolve) => {
          (window as any).__cancelDone = resolve;
        }),
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'S/ 施怀雅' }).click();
  await page.getByLabel('发给 AI 的文字').fill('Synthetic prompt');
  await page.getByRole('button', { name: '发送给 AI' }).click();
  await expect(page.getByRole('alert')).toContainText('mock failure');
  await expect(page.getByLabel('发给 AI 的文字')).toHaveValue(
    'Synthetic prompt',
  );
  await page.getByRole('button', { name: '发送给 AI' }).click();
  await page.getByRole('button', { name: '取消请求' }).click();
  await page.evaluate(() => (window as any).__reply('late reply'));
  await expect(page.getByText('late reply', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('发给 AI 的文字')).toHaveValue(
    'Synthetic prompt',
  );
  await page.getByRole('button', { name: '发送给 AI' }).click();
  await page.evaluate(() => (window as any).__cancelDone());
  await expect(page.getByRole('button', { name: '取消请求' })).toBeVisible();
  await expect(page.getByLabel('发给 AI 的文字')).toBeDisabled();
  await page.evaluate(() => (window as any).__retryReply('mock reply'));
  await expect(page.getByText('mock reply', { exact: true })).toBeVisible();
});

test('invalid long file drop reports an error without losing the existing draft', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'S/ 施怀雅' }).click();
  await page.getByLabel('收集链接').fill('https://example.com/keep');
  await page.getByRole('button', { name: '加入收集箱' }).click();
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(['test'], 'x'.repeat(201) + '.pdf'));
    return d;
  });
  await page
    .getByRole('region', { name: '施怀雅助手', exact: true })
    .dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByRole('alert')).toContainText('无法接收此内容');
  await expect(page.getByText('收集箱 · 1/30')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Command desk' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('simulated AI bridge receives only explicit input, excluding collected files and saved context', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const projectId = 'b159ea66-c6be-4e7b-941b-c7d28f2b1efb';
    const createdAt = new Date().toISOString();
    (window as any).__sentArgs = [];
    (window as any).__fileReads = 0;
    File.prototype.text = async () => {
      (window as any).__fileReads++;
      throw new Error('File content must not be read');
    };
    File.prototype.arrayBuffer = async () => {
      (window as any).__fileReads++;
      throw new Error('File content must not be read');
    };
    (window as any).swire = {
      desktop: true,
      load: async () => ({
        version: 1,
        projects: [
          { id: projectId, name: 'Synthetic private project', createdAt },
        ],
        checkpoints: [],
        messages: [
          {
            id: 'f13bf626-313b-4ab7-8bfc-d31d18d88198',
            text: 'SAVED_NOTE_SENTINEL',
            createdAt,
          },
        ],
        collections: [
          {
            id: 'eb4b7649-7858-4977-ade4-9c3b1c56a5fb',
            projectId,
            createdAt,
            references: [
              {
                label: 'Saved file',
                value: 'C:\\private\\SAVED_PATH_SENTINEL.pdf',
                group: '文档',
              },
            ],
          },
        ],
        activity: [],
        settings: { name: 'Swire', compact: false, alwaysOnTop: false },
      }),
      provider: async () => ({
        configured: true,
        model: 'mock',
        endpoint: 'https://example.invalid',
      }),
      fileReference: (file: File) => ({
        label: file.name,
        value: 'C:\\private\\DROP_PATH_SENTINEL.txt',
      }),
      chat: async (...args: unknown[]) => {
        (window as any).__sentArgs.push(args);
        return 'Synthetic mock reply';
      },
      cancelChat: async () => {},
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'S/ 施怀雅' }).click();
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File(['FILE_CONTENT_SENTINEL'], 'Synthetic dropped file.txt'),
    );
    return d;
  });
  await page
    .getByRole('region', { name: '施怀雅助手', exact: true })
    .dispatchEvent('drop', { dataTransfer: dt });
  await page
    .getByLabel('发给 AI 的文字')
    .fill('Only this explicitly submitted sentence.');
  await page.getByRole('button', { name: '发送给 AI' }).click();
  await expect(
    page.getByText('Synthetic mock reply', { exact: true }),
  ).toBeVisible();
  const args = await page.evaluate(() => (window as any).__sentArgs);
  expect(args).toHaveLength(1);
  expect(args[0]).toEqual([
    expect.stringMatching(/^[a-f0-9-]{36}$/),
    'Only this explicitly submitted sentence.',
  ]);
  expect(await page.evaluate(() => (window as any).__fileReads)).toBe(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
