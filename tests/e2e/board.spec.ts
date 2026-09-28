// Message board (SPEC §7.3) against the e2e mock: an opened line shows the record it is about, never the line again,
// with that record's own actions (Download here, Open where it lives); beside the board the right column shows today.
// Contract with the mock: 'pm' on job-a has the line "Sample Plan Set A.pdf was added to Plans" about the file
// "Sample Plan Set A.pdf" (id job-a-file-1) in Plans (job-a-plans), and the line "Delivery #3: Sample Steel Co" about
// delivery #3; job-b has "IR 12 results: Approved" about IR 12. Test ids: board-line, right-column, board-item,
// item-kind, today-panel, today-empty, cal-line.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** The opened record: the reading pane that holds the board item (right column on desktop, full screen on a phone). */
function openedPane(page: Page) {
  return page.locator('article', { has: page.getByTestId('board-item') });
}

async function openLine(page: Page, text: string) {
  await page.getByTestId('board-line').filter({ hasText: text }).click();
  await expect(page.getByTestId('board-item')).toBeVisible();
}

test.describe('message board (SPEC §7.3)', () => {
  test.skip(!MOCK, 'Board e2e runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('a line about a file opens the file with Download, not the line again', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame; the phone gets its own test.');
    await page.goto('/p/job-a/board');
    await openLine(page, 'Sample Plan Set A.pdf was added to Plans');

    const right = page.getByTestId('right-column');
    await expect(right.getByTestId('item-kind')).toHaveText('File');
    await expect(right.getByRole('heading', { name: 'Sample Plan Set A.pdf' })).toBeVisible();
    await expect(right).toContainText('Sample Job A');
    await expect(right).toContainText('Plans');
    await expect(right).not.toContainText('was added to Plans');

    const download = page.waitForEvent('download', { timeout: 10_000 });
    await right.getByRole('button', { name: 'Download', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('Sample Plan Set A.pdf');

    await right.getByRole('button', { name: 'Open in Files' }).click();
    await expect(page).toHaveURL(/\/p\/job-a\/files\/job-a-file-1\?folder=job-a-plans$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
  });

  test('other kinds show their record and open where they live', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/p/job-a/board');
    await openLine(page, 'Delivery #3: Sample Steel Co');
    const right = page.getByTestId('right-column');
    await expect(right.getByTestId('item-kind')).toHaveText('Delivery #3');
    await expect(right.getByRole('heading', { name: 'Sample Steel Co' })).toBeVisible();
    await expect(right.getByRole('button', { name: 'Open in Deliveries' })).toBeVisible();

    await page.goto('/p/job-b/board');
    await openLine(page, 'IR 12 results: Approved');
    await expect(right.getByTestId('item-kind')).toHaveText('IR 12');
    await expect(right).toContainText('Approved');
    await expect(right.getByRole('button', { name: 'Download IR' })).toBeVisible();
    await right.getByRole('button', { name: 'Open in Inspections' }).click();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'inspections');
    await expect(page.getByTestId('ir-pane')).toBeVisible();
  });

  test('beside the board, the right column shows today, not the board', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/p/job-a/board');
    const right = page.getByTestId('right-column');
    const today = right.getByTestId('today-panel');
    await expect(today).toBeVisible();
    // Either today's lines or "Nothing today." (the mock's calendar lines sit on weekdays of this week).
    await expect(today.getByTestId('cal-line').first().or(today.getByTestId('today-empty'))).toBeVisible();
    await expect(right.getByTestId('board-line')).toHaveCount(0);
  });

  test('on a phone the opened line is the record, full screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone layout.');
    await page.goto('/p/job-a/board');
    await openLine(page, 'Sample Plan Set A.pdf was added to Plans');
    const pane = openedPane(page);
    await expect(pane.getByTestId('item-kind')).toHaveText('File');
    await expect(pane.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
    await expect(pane).not.toContainText('was added to Plans');
  });
});
