// Files: a job opens with the folders its company kind uses most, in that order (migration 0027), the folders only
// the app fills (Reports, Bids received, Emailed in ...) stay out of the tree while empty and carry a lock (0092), and a
// new folder asks one question. Uploads: files dropped on the list go up,
// a file storage refuses says so in one short line, and an upload that was refused, stopped or left unfinished can
// be removed (migration 0065). The file viewer (migration 0074): a sheet in Plans straight to full screen, a photo in
// the file's pane, Full screen, the arrows and Escape; Delete with Undo, Rename, and no Delete on a signed record. Runs only against the e2e
// mock data layer.
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

  test("a GC job lists Plans first and Photos last; the app's empty folders are hidden", async ({ page }) => {
    await signIn(page, 'pm', '/p/job-a/board');
    await page.getByTestId('rail-files').click();
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'Photos']);
    await expect(page.getByTestId('folder').first()).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('folder-lock')).toHaveCount(0);
  });

  test("a folder the app fills shows once it has something, with a lock and no Upload", async ({ page }) => {
    await signIn(page, 'pm', '/p/job-b/files');
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'Reports', 'Photos']);
    const reports = page.getByTestId('folder').filter({ hasText: 'Reports' });
    await expect(reports.getByTestId('folder-lock')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
    await reports.click();
    await expect(fileNamed(page, 'Sample Daily Report 7.pdf')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toHaveCount(0);
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

    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'Photos', 'Sample submittals']);
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
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs', 'DSA 103', 'CCDs', 'Photos']);
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

test.describe('files: the viewer, Delete and Rename', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('in Plans a sheet opens full screen at once; Escape shows its pane, with one Full screen and no small copy', async ({ page }, testInfo) => {
    await openPlans(page);
    await fileNamed(page, 'Sample Plan Set A.pdf').click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer).toBeVisible();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Plan Set A.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await viewer.getByRole('button', { name: 'Zoom in' }).click();
    await expect(viewer.getByTestId('viewer-zoom')).toContainText('125%');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(page.getByTestId('file-preview')).toHaveCount(0);
    if (testInfo.project.name === 'desktop') {
      // In the right column its Full screen is the one way to enlarge it (Jesse, Oct 10): the sheet draws there.
      const right = page.getByTestId('right-column');
      await expect(page.getByTestId('file-full-screen')).toHaveCount(0);
      await right.getByTestId('right-full').click();
      await expect(right).toHaveAttribute('data-full', 'true');
      await expect(right.getByTestId('file-preview').getByTestId('viewer-page')).toHaveText('Page 1 of 3');
      await expect(right.getByTestId('file-preview-full')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(right).toHaveAttribute('data-full', 'false');
      await expect(page.getByTestId('file-preview')).toHaveCount(0);
      return;
    }
    await page.getByTestId('file-full-screen').click();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Plan Set A.pdf');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test("a row's icon opens the folder's PDFs full screen; the arrows and the keys walk them", async ({ page }) => {
    await openPlans(page);
    await page.getByTestId('file-row-view').first().click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByTestId('viewer-count')).toHaveText('1 of 3');
    await expect(viewer.getByTestId('viewer-prev')).toBeDisabled();
    await viewer.getByTestId('viewer-next').click();
    await expect(viewer.getByTestId('viewer-count')).toHaveText('2 of 3');
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByTestId('viewer-count')).toHaveText('3 of 3');
    await expect(viewer.getByTestId('viewer-next')).toBeDisabled();
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.getByTestId('viewer-count')).toHaveText('2 of 3');
    await viewer.getByTestId('viewer-close').click();
    await expect(viewer).toHaveCount(0);
  });

  test('a photo shows whole in its pane and full screen, and a tap zooms it', async ({ page }, testInfo) => {
    await signIn(page, 'pm', '/p/job-b/files?folder=job-b-photos');
    await fileNamed(page, 'Sample corridor photo.jpg').click();
    await expect(page.getByTestId('file-preview').getByRole('img', { name: 'Sample corridor photo.jpg' })).toBeVisible();
    if (testInfo.project.name === 'desktop') {
      // In the right column: the column's Full screen only; Escape comes back.
      const right = page.getByTestId('right-column');
      await expect(right.getByTestId('file-preview-full')).toHaveCount(0);
      await right.getByTestId('right-full').click();
      await expect(right).toHaveAttribute('data-full', 'true');
      await expect(right.getByTestId('file-preview').getByRole('img', { name: 'Sample corridor photo.jpg' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(right).toHaveAttribute('data-full', 'false');
      return;
    }
    await page.getByTestId('file-preview-full').click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByRole('img', { name: 'Sample corridor photo.jpg' })).toBeVisible();
    await viewer.getByTestId('viewer-image').click();
    await expect(viewer.getByTestId('viewer-zoom')).toContainText('250%');
    await viewer.getByRole('button', { name: 'Fit' }).click();
    await expect(viewer.getByTestId('viewer-zoom')).toContainText('100%');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('Delete takes the file away at once, and Undo brings it back', async ({ page }) => {
    await openPlans(page);
    await fileNamed(page, 'Sample Plan Set A.pdf').click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('file-delete').click();
    await expect(fileNamed(page, 'Sample Plan Set A.pdf')).toHaveCount(0);
    await expect(page.getByTestId('file-preview')).toHaveCount(0);
    const toast = page.getByRole('status').filter({ hasText: 'Sample Plan Set A.pdf deleted.' });
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(fileNamed(page, 'Sample Plan Set A.pdf')).toHaveCount(1);
  });

  test('Rename saves the new name in the pane and the list', async ({ page }) => {
    await openPlans(page);
    await fileNamed(page, 'Sample Plan Set A.pdf').click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('file-rename').click();
    await page.getByTestId('file-rename-name').fill('Sample Plan Set A rev 2.pdf');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sample Plan Set A rev 2.pdf' })).toBeVisible();
    await expect(fileNamed(page, 'Sample Plan Set A rev 2.pdf')).toHaveCount(1);
  });

  test('a signed daily report PDF shows, but offers no Delete or Rename', async ({ page }) => {
    await signIn(page, 'pm', '/p/job-b/files?folder=job-b-reports');
    await fileNamed(page, 'Sample Daily Report 7.pdf').click();
    await expect(page.getByTestId('file-preview').getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
    await expect(page.getByTestId('file-delete')).toHaveCount(0);
    await expect(page.getByTestId('file-rename')).toHaveCount(0);
  });
});
