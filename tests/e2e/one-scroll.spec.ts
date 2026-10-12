// One Full screen, one New window, one scroll per screen (Jesse, Oct 12): a file opened in the right column fills it
// with its box, and only the box scrolls; the column's Full screen keeps that; the box's own button is New window,
// opening the file alone in its own window (?window=1), and the pane has no second open-window control. The same on the
// phone's item screen and in the file's own window. Runs only against the e2e mock data layer. Sample Job B's signed
// daily PDF (job-b-daily-7, the synthetic 3-page set) and its corridor photo (job-b-photo-1). Test ids: file-preview,
// file-preview-window, right-column, right-column-body, right-full, item-open-window, comments, viewer-page.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const DAILY = '/p/job-b/files/job-b-daily-7';
const PHOTO = '/p/job-b/files/job-b-photo-1';

async function signIn(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('e2e-mock-user', 'pm');
  });
  try {
    await page.goto(path);
  } catch (e) {
    // The first page of a test can reload itself once (a new build taking over) while this navigation starts.
    if (!String(e).includes('interrupted by another navigation')) throw e;
    await page.waitForLoadState();
    await page.goto(path);
  }
}

/** What scrolls around the file's box (anything with a scroll bar that has somewhere to go), the page itself included. */
async function scrollersAround(page: Page): Promise<string[]> {
  return page.getByTestId('file-preview').evaluate((box) => {
    const found: string[] = [];
    for (let el = box.parentElement; el !== null; el = el.parentElement) {
      const y = getComputedStyle(el).overflowY;
      if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 1) found.push(el.getAttribute('data-testid') ?? el.tagName);
    }
    const doc = document.scrollingElement;
    if (doc !== null && doc.scrollHeight > doc.clientHeight + 1) found.push('page');
    return found;
  });
}

async function bodyScrolls(page: Page): Promise<boolean> {
  return page.getByTestId('right-column-body').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
}

test.describe('one scroll per screen', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a file in the right column: only its box scrolls, docked and at Full screen; New window opens it alone', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The right column is the desktop frame.');
    await signIn(page, DAILY);
    const right = page.getByTestId('right-column');
    const box = right.getByTestId('file-preview');
    await expect(box.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    expect(await bodyScrolls(page)).toBe(false);
    expect(await scrollersAround(page)).toEqual([]);

    // One open-window control on the pane: the box's New window (no footer copy, none in the column's header).
    await expect(box.getByTestId('file-preview-window')).toHaveText('New window');
    await expect(right.getByTestId('item-open-window')).toHaveCount(0);
    await expect(right.getByRole('button', { name: 'Open in new window' })).toHaveCount(0);
    await expect(right.getByRole('button', { name: 'Full screen' })).toHaveCount(1);

    await page.getByTestId('right-full').click();
    await expect(right).toHaveAttribute('data-full', 'true');
    await expect(right.getByTestId('comments')).toBeVisible();
    await expect(box.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    expect(await bodyScrolls(page)).toBe(false);
    expect(await scrollersAround(page)).toEqual([]);

    const opened = page.context().waitForEvent('page');
    await box.getByTestId('file-preview-window').click();
    const win = await opened;
    await win.waitForLoadState();
    await expect(win).toHaveURL(/\/p\/job-b\/files\/job-b-daily-7\?window=/);
    await expect(page.getByTestId('file-viewer')).toHaveCount(0);
  });

  test('a photo in the right column fills it too', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The right column is the desktop frame.');
    await signIn(page, PHOTO);
    await expect(page.getByTestId('file-preview').getByRole('img', { name: 'Sample corridor photo.jpg' })).toBeVisible();
    expect(await bodyScrolls(page)).toBe(false);
    expect(await scrollersAround(page)).toEqual([]);
  });

  test('the file in its own window fills the window, with no New window and no page scroll', async ({ page }) => {
    await signIn(page, `${DAILY}?window=1`);
    const box = page.getByTestId('file-preview');
    await expect(box.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('comments')).toBeVisible();
    await expect(box.getByTestId('file-preview-window')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open in new window' })).toHaveCount(0);
    expect(await scrollersAround(page)).toEqual([]);
  });

  test('phone: the file fills the screen below its header, one scroll', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The phone shell.');
    await signIn(page, DAILY);
    const box = page.getByTestId('file-preview');
    await expect(box.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('comments')).toBeVisible();
    await expect(box.getByTestId('file-preview-window')).toHaveCount(0);
    expect(await scrollersAround(page)).toEqual([]);
  });
});
