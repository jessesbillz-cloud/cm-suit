// Message board (SPEC §7.3) against the e2e mock: an opened line shows the record it is about, never the line again,
// with that record's own actions (Download here, Open where it lives); beside the board the right column shows today.
// Contract with the mock: 'pm' on job-a has the line "Sample Plan Set A.pdf was added to Plans" about the file
// "Sample Plan Set A.pdf" (id job-a-file-1) in Plans (job-a-plans), and the line "Delivery #3: Sample Steel Co" about
// delivery #3 (two days out); job-b has "IR 12 results: Approved" about IR 12; job-a's "RFI 002 impact claimed" is about
// RFI 002, which has two comments. The bidder has "Acknowledge addendum 1" to do; the inspector "Re-inspect CN-004"
// (job-b). Job-a has two deliveries today, one with its time TBD. Test ids: board-line, right-column, board-item,
// item-kind, today-panel, today-empty, cal-line, needs-you-task, comments, comment, comment-input.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** The day `n` days from today on the jobs' clock (America/Los_Angeles), as yyyy-mm-dd. */
function fromToday(n: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function as(page: Page, who: string): Promise<void> {
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
}

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
    await expect(page).toHaveURL(/\/p\/job-a\/files\/job-a-file-1\?folder=job-a-plans&back=1$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
    // Back (top bar) returns to the board with the line open, as it was.
    await page.getByTestId('frame-back').click();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'board');
    await expect(right.getByRole('button', { name: 'Open in Files' })).toBeVisible();
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

  test("a bidder's addendum task is acknowledged in place, which records the acknowledgment", async ({ page }) => {
    await as(page, 'bidder');
    await page.goto('/p/job-a/board');
    const task = page.getByTestId('needs-you-task').filter({ hasText: 'Acknowledge addendum 1' });
    await expect(task.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await task.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(page.getByTestId('needs-you-task').filter({ hasText: 'Acknowledge addendum 1' })).toHaveCount(0);
    await page.goto('/p/job-a/bids');
    await expect(page.getByTestId('addendum-acked-1')).toBeVisible();
  });

  test('a task its record closes has Open, which goes to the record', async ({ page }) => {
    await as(page, 'inspector');
    await page.goto('/p/job-b/board');
    const task = page.getByTestId('needs-you-task').filter({ hasText: 'Re-inspect CN-004' });
    await expect(task.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await task.getByRole('button', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/p\/job-b\/corrections\/cn-job-b-4/);
  });

  test('a record opened at full width has its comments; the preview has none', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/p/job-a/board');
    await openLine(page, 'RFI 002 impact claimed');
    // The RFI's route strip reads right here, without leaving the board.
    await expect(page.getByTestId('right-column').getByTestId('rfi-entity-strip')).toBeVisible();
    await expect(page.getByTestId('comments')).toHaveCount(0);
    await page.getByTestId('right-full').click();
    await expect(page.getByTestId('comments').getByTestId('comment')).toHaveCount(2);
    // The new comment box takes more than one line: Shift+Enter is a new line, Enter sends.
    const box = page.getByTestId('comment-input');
    await box.fill('Sample: first line');
    await box.press('Shift+Enter');
    await box.pressSequentially('second line');
    await expect(box).toHaveValue('Sample: first line\nsecond line');
    await box.press('Enter');
    await expect(page.getByTestId('comments').getByTestId('comment')).toHaveCount(3);
  });

  test('the type filter lists every kind, loaded or not', async ({ page }) => {
    await page.goto('/p/job-a/board');
    const filter = page.getByLabel('Filter by type');
    await expect(filter.locator('option', { hasText: 'Safety tailgate due' })).toHaveCount(1);
    await expect(filter.locator('option', { hasText: 'Delivery posted' })).toHaveCount(1);
  });

  test('a delivery opened from the board shows its day behind it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/p/job-a/board');
    await openLine(page, 'Delivery #3: Sample Steel Co');
    await page.getByTestId('right-column').getByRole('button', { name: 'Open in Deliveries' }).click();
    await expect(page).toHaveURL(new RegExp(`/deliveries/mock-delivery-3\\?.*day=${fromToday(2)}`));
    await expect(page.getByTestId(`delivery-day-${fromToday(2)}`)).toHaveAttribute('aria-pressed', 'true');
  });

  test("today's deliveries read Time TBD and wear no Confirmed chip", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/p/job-a/board');
    const today = page.getByTestId('right-column').getByTestId('today-panel');
    await expect(today.getByTestId('cal-line').filter({ hasText: 'Sample Lumber' })).toBeVisible();
    await expect(today).toContainText('Time TBD');
    await expect(today.getByTestId('cal-line').filter({ hasText: 'Sample Concrete Co' })).not.toContainText('Confirmed');
  });

  test('View opens the record in the file viewer: a file, an IR, a daily, an RFI, a correction\'s photos', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    const right = page.getByTestId('right-column');
    const viewer = page.getByTestId('file-viewer');
    // The pane shows the record just opened (not the one before it) before View is pressed.
    async function viewPdf(kind: string, name: string) {
      await expect(right.getByTestId('item-kind')).toHaveText(kind);
      await right.getByTestId('board-item-view').click();
      await expect(viewer.getByTestId('viewer-name')).toHaveText(name);
      await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
    }

    await page.goto('/p/job-a/board');
    await openLine(page, 'Sample Plan Set A.pdf was added to Plans');
    await viewPdf('File', 'Sample Plan Set A.pdf');
    await openLine(page, 'RFI 002 impact claimed');
    await viewPdf('RFI 002', 'RFI 002.pdf');

    await page.goto('/p/job-b/board');
    await openLine(page, 'IR 12 results: Approved');
    await viewPdf('IR 12', 'IR 12.pdf');
    await expect(right.getByRole('button', { name: 'Download IR' })).toBeVisible();
    await openLine(page, 'Daily report #7');
    await viewPdf('Daily report #7', 'Sample Daily Report 7.pdf');
    await openLine(page, 'CN-004 opened');
    await expect(right.getByTestId('item-kind')).toHaveText('CN-004');
    await right.getByTestId('board-item-view').click();
    await expect(viewer.getByRole('img', { name: 'Sample corridor photo.jpg' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });
});
