// Files: a job opens with the folders its company kind uses most, in that order (migration 0027), an empty
// "Emailed in" stays out of the tree, and a new folder asks one question. Uploads: files dropped on the list go up,
// a file storage refuses says so in one short line, and an upload that was refused, stopped or left unfinished can
// be removed (migration 0065). Runs only against the e2e mock data layer.
import process from 'node:process';
import { expect, test, type JSHandle, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** Signs in as a mock user on the desktop layout (the phone shell has its own Files screens). "/" is All my jobs. */
async function signIn(page: Page, who: string, path = '/'): Promise<void> {
  test.skip(test.info().project.name !== 'desktop', 'Uses the desktop rail.');
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto(path);
}

/**
 * What a drag from the desktop carries, made inside the page (Playwright cannot drag real files in). The bytes are
 * zeros made in the browser, so a large file costs nothing to send.
 */
async function dragOf(page: Page, name: string, bytes: number): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(
    (f) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: 'application/pdf' }));
      return dt;
    },
    { name, bytes },
  );
}

/** Opens job A's Files (the Plans folder) as the PM and waits until uploading is allowed. */
async function openPlans(page: Page): Promise<void> {
  await signIn(page, 'pm', '/p/job-a/files');
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
  await expect(page.getByTestId('file-row').first()).toBeVisible();
}

const fileNamed = (page: Page, name: string) => page.getByTestId('file-row-name').filter({ hasText: name });

test.describe('files: folders by who uses them', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a GC job lists Plans first and Photos last; an empty Emailed in is hidden', async ({ page }) => {
    await signIn(page, 'pm', '/p/job-a/board');
    await page.getByTestId('rail-files').click();
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'Bids received', 'Reports', 'Photos']);
    await expect(page.getByTestId('folder').first()).toHaveAttribute('aria-current', 'true');
  });

  test('a new folder asks whether search and the AI read it (on by default), and it can change later', async ({ page }) => {
    await signIn(page, 'pm', '/p/job-a/board');
    await page.getByTestId('rail-files').click();
    await page.getByRole('button', { name: 'New folder' }).click();
    await page.getByTestId('new-folder-name').fill('Sample submittals');
    const ask = page.getByTestId('new-folder-ai-reads');
    await expect(ask).toBeChecked();
    await ask.uncheck();
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'Bids received', 'Reports', 'Photos', 'Sample submittals']);
    const toggle = page.getByTestId('folder-ai-reads');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
  });

  test("an inspector's DSA job opens with Plans, Specs, DSA 103 and CCDs", async ({ page }) => {
    await signIn(page, 'newcomer');
    await page.getByTestId('setup-company-name').fill('Sample Inspection Co');
    await page.getByLabel('Type').selectOption('inspector');
    await page.getByTestId('setup-company-next').click();
    await page.getByTestId('setup-job-name').fill('Sample School');
    await page.getByTestId('setup-job-dsa').check();
    await page.getByTestId('setup-job-create').click();
    await expect(page.getByTestId('main-area')).toBeVisible();

    await page.getByTestId('rail-files').click();
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'DSA 103', 'CCDs', 'Reports', 'Photos']);
  });
});

test.describe('files: uploads', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a file dropped on the list uploads into the folder being shown', async ({ page }) => {
    await openPlans(page);
    const zone = page.getByTestId('files-drop');
    const dataTransfer = await dragOf(page, 'Sample dropped sheet.pdf', 2048);

    await zone.dispatchEvent('dragenter', { dataTransfer });
    await expect(page.getByTestId('files-drop-hint')).toHaveText('Drop to upload');
    await zone.dispatchEvent('drop', { dataTransfer });
    await expect(page.getByTestId('files-drop-hint')).toHaveCount(0);

    await expect(fileNamed(page, 'Sample dropped sheet.pdf')).toBeVisible();
    await expect(page.getByTestId('upload-line-status')).toHaveText('Uploaded; scanning');
  });

  test('a file storage refuses as too large says so in one plain line, and Remove clears it for good', async ({ page }) => {
    await openPlans(page);
    // One byte over what the mock storage takes (50 MB), like the hosted cap.
    const dataTransfer = await dragOf(page, 'Sample 38 pages.pdf', 50 * 1024 * 1024 + 1);
    await page.getByTestId('files-drop').dispatchEvent('drop', { dataTransfer });

    const line = page.getByTestId('upload-line');
    await expect(line.getByTestId('upload-line-status')).toHaveText('Too big to upload here.');
    // Trying again cannot work, so it is not offered.
    await expect(line.getByRole('button', { name: /^Retry/ })).toHaveCount(0);
    await line.getByRole('button', { name: 'Remove Sample 38 pages.pdf' }).click();
    await expect(line).toHaveCount(0);

    // Nothing is left behind: no file, and no unfinished line on the next visit.
    await page.reload();
    await expect(page.getByTestId('file-row').first()).toBeVisible();
    await expect(page.getByTestId('upload-leftover')).toHaveCount(0);
    await expect(fileNamed(page, 'Sample 38 pages.pdf')).toHaveCount(0);
  });

  test('an upload in progress can be stopped, then removed', async ({ page }) => {
    await openPlans(page);
    // Big enough that the mock upload takes a few seconds.
    const dataTransfer = await dragOf(page, 'Sample big set.pdf', 8 * 1024 * 1024);
    await page.getByTestId('files-drop').dispatchEvent('drop', { dataTransfer });

    const line = page.getByTestId('upload-line');
    await line.getByRole('button', { name: 'Stop Sample big set.pdf' }).click();
    await expect(line.getByTestId('upload-line-status')).toHaveText('Stopped');
    await expect(line.getByRole('button', { name: 'Retry Sample big set.pdf' })).toBeVisible();
    await line.getByRole('button', { name: 'Remove Sample big set.pdf' }).click();
    await expect(line).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('file-row').first()).toBeVisible();
    await expect(page.getByTestId('upload-leftover')).toHaveCount(0);
    await expect(fileNamed(page, 'Sample big set.pdf')).toHaveCount(0);
  });

  test('the same file added again picks a stopped upload back up: one line, then one file', async ({ page }) => {
    await openPlans(page);
    const zone = page.getByTestId('files-drop');
    const dataTransfer = await dragOf(page, 'Sample half set.pdf', 4 * 1024 * 1024);
    await zone.dispatchEvent('drop', { dataTransfer });

    const line = page.getByTestId('upload-line');
    await line.getByRole('button', { name: 'Stop Sample half set.pdf' }).click();
    await expect(line.getByTestId('upload-line-status')).toHaveText('Stopped');

    await zone.dispatchEvent('drop', { dataTransfer });
    // The stopped line and the new one are the same upload: one line, and it finishes as one file.
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('upload-line-status')).toHaveText('Uploaded; scanning', { timeout: 15_000 });
    await expect(fileNamed(page, 'Sample half set.pdf')).toHaveCount(1);
    await expect(page.getByTestId('upload-leftover')).toHaveCount(0);
  });

  test('an upload an earlier visit left unfinished is a line to remove, never a file; someone else\'s does not show', async ({ page }) => {
    await page.addInitScript(() => {
      // Only on first load, so what the test removes stays removed after a reload.
      if (window.sessionStorage.getItem('e2e-mock-state') !== null) return;
      const unfinished = { project_id: 'job-a', folder_id: 'job-a-plans', mime: 'application/pdf', scan_status: 'pending', upload_complete: false, created_at: '2026-10-03T16:00:00Z' };
      window.sessionStorage.setItem(
        'e2e-mock-state',
        JSON.stringify({
          files: [
            { ...unfinished, id: 'mock-file-1', original_name: 'Sample left behind.pdf', size: 96_468_992, created_by: 'mock-user-pm' },
            { ...unfinished, id: 'mock-file-2', original_name: 'Sample someone else.pdf', size: 1024, created_by: 'mock-someone' },
          ],
        }),
      );
    });
    await openPlans(page);

    const left = page.getByTestId('upload-leftover');
    await expect(left).toHaveCount(1);
    await expect(left).toContainText('Sample left behind.pdf');
    await expect(left).toContainText('Not finished · 92 MB');
    await expect(fileNamed(page, 'Sample left behind.pdf')).toHaveCount(0);
    await expect(page.getByText('Sample someone else.pdf')).toHaveCount(0);

    await left.getByRole('button', { name: 'Remove Sample left behind.pdf' }).click();
    await expect(left).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('file-row').first()).toBeVisible();
    await expect(page.getByTestId('upload-leftover')).toHaveCount(0);
  });
});
