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
