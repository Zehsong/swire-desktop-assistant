import { test, expect } from '@playwright/test';
test('local project, checkpoint, references, note and settings survive reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Browser preview —')).toBeVisible();
  await page.getByRole('button', { name: '＋ Create project' }).click();
  await page.getByLabel('Project name').fill('Swire companion');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '＋ New checkpoint' }).click();
  await page.getByLabel('Checkpoint title').fill('Windows foundation');
  await page
    .getByLabel('Notes', { exact: true })
    .fill('Next: verify the packaged app on Windows.');
  await page.getByLabel('Reference label').fill('Design notes');
  await page
    .getByLabel('Reference path or URL')
    .fill('C:\\Projects\\Swire\\notes.md');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Desktop only', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Save checkpoint', exact: true })
    .click();
  await page
    .getByLabel('Personal note')
    .fill('Remember to test multiple monitors.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(
    page.getByText('Remember to test multiple monitors.'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace.png', fullPage: true });
  await page.getByRole('button', { name: '02 Timeline' }).click();
  await expect(
    page.getByText('Next: verify the packaged app on Windows.'),
  ).toBeVisible();
  await expect(page.getByText('C:\\Projects\\Swire\\notes.md')).toBeVisible();
  await page.getByRole('button', { name: '04 Settings' }).click();
  await page.getByLabel('Companion name').fill('施怀雅');
  await page.getByLabel('Compact spacing').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '施怀雅 / 施怀雅' }),
  ).toBeVisible();
  await expect(
    page.getByText('Remember to test multiple monitors.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Windows foundation' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '03 Activity' }).click();
  await expect(
    page.getByText('Checkpoint saved: Windows foundation'),
  ).toBeVisible();
  await expect(page.getByText('Companion settings updated')).toBeVisible();
});
test('cancel discards checkpoint draft and keyboard closes modal', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '＋ Create project' }).click();
  await page.getByLabel('Project name').fill('Test');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '＋ New checkpoint' }).click();
  await page.getByLabel('Checkpoint title').fill('Do not save');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '＋ New checkpoint' }).click();
  await expect(page.getByLabel('Checkpoint title')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Save checkpoint', exact: true }),
  ).toBeDisabled();
});
test('capture contract: explicit preview, cancel and commit (simulated desktop bridge)', async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const state = {
      version: 1,
      projects: [
        {
          id: 'b159ea66-c6be-4e7b-941b-c7d28f2b1efb',
          name: 'Capture test',
          createdAt: new Date().toISOString(),
        },
      ],
      checkpoints: [],
      messages: [],
      activity: [],
      settings: { name: 'Swire', compact: false, alwaysOnTop: false },
    };
    const trace = {
      previews: 0,
      cancels: 0,
      committedToken: undefined as string | undefined,
    };
    (window as any).__captureTrace = trace;
    (window as any).swire = {
      desktop: true,
      load: async () => state,
      previewCapture: async () => {
        trace.previews++;
        return [
          {
            token: 'preview-token',
            name: 'Screen 1',
            image:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKh0AAAAASUVORK5CYII=',
          },
        ];
      },
      cancelCapture: async () => {
        trace.cancels++;
      },
      checkpoint: async (_input: unknown, token?: string) => {
        trace.committedToken = token;
        return state;
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '＋ New checkpoint' }).click();
  await page.getByLabel('Checkpoint title').fill('Review capture');
  expect(
    await page.evaluate(() => (window as any).__captureTrace.previews),
  ).toBe(0);
  await page.getByRole('button', { name: 'Capture & preview' }).click();
  await expect(page.getByAltText('Preview of Screen 1')).toBeVisible();
  await page
    .getByRole('button', { name: 'Cancel capture', exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).__captureTrace.cancels),
  ).toBe(1);
  await expect(page.getByLabel('Checkpoint title')).toHaveValue(
    'Review capture',
  );
  await page.getByRole('button', { name: 'Capture & preview' }).click();
  await page.getByRole('button', { name: 'Use Screen 1' }).click();
  await page.clock.fastForward(600001);
  await expect(page.getByRole('alert')).toContainText(
    'Capture preview expired',
  );
  await expect(
    page.getByAltText('Selected screen capture preview'),
  ).not.toBeVisible();
  await expect(page.getByLabel('Checkpoint title')).toHaveValue(
    'Review capture',
  );
  await page.getByRole('button', { name: 'Capture & preview' }).click();
  await page.getByRole('button', { name: 'Use Screen 1' }).click();
  expect(
    await page.evaluate(() => (window as any).__captureTrace.committedToken),
  ).toBeUndefined();
  await page
    .getByRole('button', { name: 'Save checkpoint', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__captureTrace.committedToken),
  ).toBe('preview-token');
});
test('storage failure is visible and a checkpoint draft remains available for retry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '＋ Create project' }).click();
  await page.getByLabel('Project name').fill('Retry');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '＋ New checkpoint' }).click();
  await page.getByLabel('Checkpoint title').fill('Keep my draft');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage full');
    };
  });
  await page
    .getByRole('button', { name: 'Save checkpoint', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText('Storage full');
  await expect(page.getByLabel('Checkpoint title')).toHaveValue(
    'Keep my draft',
  );
  await expect(
    page.getByRole('button', { name: 'Save checkpoint', exact: true }),
  ).toBeEnabled();
});
