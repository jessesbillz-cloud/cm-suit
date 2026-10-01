// The rail by position (Jesse, Sep 28: "we have our recommendations based on the type of position you have") in two
// parts (Jesse, Oct 1): the general things on top (Board, Calendar, and Bids / Timesheets when they apply), and with a
// job picked, that job's tools under its name, chosen per job with Edit; every other tool one click away under More,
// and a count where something needs me. Runs only against the e2e mock.
// Contract with the mock (src/data/mock/rail.ts, mock/jobRail.ts): 'pm' has no list of their own, so Sample Job A shows
// Board, Calendar, Bids on top and the PM's tools under "Sample Job A": RFIs, Inspections, Files; Dailies, Deliveries,
// Corrections, People sit under More. Sample Job B has the same tools. What needs 'pm' on job A: task-1 on a file
// (Files: 1) and RFIs 003 and 004 left with the architect (RFIs: 2). 'inspector' gets Dailies, Inspections,
// Corrections, Files under the job's name. Test ids: rail-<tool>, rail-more, rail-more-menu, rail-more-<tool>,
// job-rail (the job's tools; data-version = my saved list's version), job-rail-label, job-rail-edit, job-rail-editor,
// job-tool-show-<tool>, job-tool-up-<tool>, job-tools-recommended, job-tools-done, phone-tab-<tool>, phone-tab-more,
// phone-more-<tool>, phone-more-edit, tool-badge-<tool | more>, needs-you-task, main-area (data-tool).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function signIn(page: Page, who: string): Promise<void> {
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
}

function railIds(page: Page): Promise<(string | null)[]> {
  return page
    .getByRole('navigation', { name: 'Tools' })
    .locator('[data-testid^="rail-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
}

/** The tools under the job's name, in order. */
function jobIds(page: Page): Promise<(string | null)[]> {
  return page
    .getByTestId('job-rail')
    .locator('[data-testid^="rail-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
}

function tabIds(page: Page): Promise<(string | null)[]> {
  return page.getByTestId(/^phone-tab-/).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
}

async function pickJob(page: Page, name: RegExp): Promise<void> {
  await page.getByTestId('job-picker').click();
  await page.getByRole('option', { name }).click();
}

test.describe('the rail by position', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('desktop: the general tools on top, the PM\'s tools under the job, the rest under More, one click away', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/board');
    await expect
      .poll(() => railIds(page))
      .toEqual(['rail-board', 'rail-calendar', 'rail-bids', 'rail-rfis', 'rail-inspections', 'rail-files', 'rail-more', 'rail-settings']);
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-inspections', 'rail-files']);

    await page.getByTestId('rail-more').click();
    const menu = page.getByTestId('rail-more-menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Dailies', 'Deliveries', 'Corrections', 'People']);
    await page.getByTestId('rail-more-dailies').click();
    await expect(page).toHaveURL(/\/p\/job-a\/dailies$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'dailies');
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId('rail-more')).toHaveAttribute('aria-current', 'page');
  });

  test('desktop: an inspector gets the inspector\'s tools', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'inspector');
    await page.goto('/p/job-a/board');
    await expect
      .poll(() => jobIds(page))
      .toEqual(['rail-dailies', 'rail-inspections', 'rail-corrections', 'rail-files']);
    await expect(page.getByTestId('rail-board')).toBeVisible();
    await expect(page.getByTestId('rail-calendar')).toBeVisible();
  });

  test('counts: what needs me sits on the tool that owns it and goes when it is done', async ({ page, isMobile }) => {
    await signIn(page, 'pm');
    await page.goto('/p/job-a/board');
    await expect(page.getByTestId('tool-badge-rfis')).toHaveText('2');
    // The phone bar holds the first four tools; Files is under More there.
    const files = page.getByTestId(isMobile ? 'tool-badge-more' : 'tool-badge-files');
    await expect(files).toHaveText('1');

    await page.getByTestId('needs-you-task').getByRole('button', { name: 'Done' }).click();
    await expect(files).toHaveCount(0);
    await expect(page.getByTestId('tool-badge-rfis')).toHaveText('2');
  });

  test('phone: Board, Calendar, then the job\'s first tools on the bar; the rest under More', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Uses the phone bar.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/board');
    await expect
      .poll(() => tabIds(page))
      .toEqual(['phone-tab-board', 'phone-tab-calendar', 'phone-tab-rfis', 'phone-tab-inspections', 'phone-tab-more']);
    await page.getByTestId('phone-tab-more').click();
    await expect(page.getByTestId('phone-more-bids')).toBeVisible();
    await expect(page.getByTestId('phone-more-files')).toBeVisible();
    await page.getByTestId('phone-more-dailies').click();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'dailies');
    await expect(page.getByTestId('phone-tab-dailies')).toHaveAttribute('aria-current', 'page');
  });

  test('All my jobs: the cross-job tools; what needs me on job-only tools counts on the Board', async ({ page, isMobile }) => {
    await signIn(page, 'pm');
    await page.goto('/all/board');
    await expect(page.getByTestId(isMobile ? 'phone-tab-bids' : 'rail-bids')).toBeVisible();
    await expect(page.getByTestId(isMobile ? 'phone-tab-more' : 'rail-more')).toHaveCount(isMobile ? 1 : 0);
    await expect(page.getByTestId('tool-badge-board')).toHaveText('3');
  });
});

test.describe('the rail in two parts: each job\'s tools, chosen per job (Jesse, Oct 1)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('desktop: a job\'s part shows under its name; Edit changes that job only', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'pm');
    await page.goto('/all/board');
    await expect(page.getByTestId('rail-board')).toBeVisible();
    await expect(page.getByTestId('job-rail-label')).toHaveCount(0);
    await expect(page.getByTestId('job-rail-edit')).toHaveCount(0);

    // Pick a job: the top stays, the job's tools appear under its name.
    await pickJob(page, /Sample Job A/);
    await expect(page).toHaveURL(/\/p\/job-a\/board$/);
    await expect(page.getByTestId('job-rail-label')).toHaveText('Sample Job A');
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-inspections', 'rail-files']);
    await expect(page.getByTestId('rail-board')).toBeVisible();

    // Edit: add Dailies, take Inspections off, move Files up. Each change shows at once.
    const part = page.getByTestId('job-rail');
    const editor = page.getByTestId('job-rail-editor');
    await page.getByTestId('job-rail-edit').click();
    await expect(editor.getByTestId('job-tool-show-rfis')).toBeChecked();
    await expect(editor.getByTestId('job-tools-recommended')).toHaveCount(0);
    // click, not check(): the box follows the saved list a tick after the click.
    await editor.getByTestId('job-tool-show-dailies').click();
    await expect(editor.getByTestId('job-tool-show-dailies')).toBeChecked();
    await expect(part).toHaveAttribute('data-version', '1');
    await editor.getByTestId('job-tool-show-inspections').click();
    await expect(editor.getByTestId('job-tool-show-inspections')).not.toBeChecked();
    await expect(part).toHaveAttribute('data-version', '2');
    await editor.getByTestId('job-tool-up-files').click();
    await expect(part).toHaveAttribute('data-version', '3');
    await expect.poll(() => jobIds(page)).toEqual(['rail-files', 'rail-rfis', 'rail-dailies']);
    await editor.getByTestId('job-tools-done').click();
    await expect(editor).toHaveCount(0);

    // What came off is one click away under More.
    await page.getByTestId('rail-more').click();
    await expect(page.getByTestId('rail-more-menu').getByRole('menuitem')).toHaveText(['Inspections', 'Deliveries', 'Corrections', 'People']);
    await page.keyboard.press('Escape');

    // Kept after a reload; another job keeps its own list.
    await page.reload();
    await expect.poll(() => jobIds(page)).toEqual(['rail-files', 'rail-rfis', 'rail-dailies']);
    await pickJob(page, /Sample Job B/);
    await expect(page).toHaveURL(/\/p\/job-b\/board$/);
    await expect(page.getByTestId('job-rail-label')).toHaveText('Sample Job B');
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-inspections', 'rail-files']);

    // Back on job A: Recommended puts my position's tools back, and Undo brings my own list back.
    await pickJob(page, /Sample Job A/);
    await expect.poll(() => jobIds(page)).toEqual(['rail-files', 'rail-rfis', 'rail-dailies']);
    await page.getByTestId('job-rail-edit').click();
    await editor.getByTestId('job-tools-recommended').click();
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-inspections', 'rail-files']);
    await expect(editor.getByTestId('job-tools-recommended')).toHaveCount(0);
    await editor.getByTestId('job-tools-done').click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => jobIds(page)).toEqual(['rail-files', 'rail-rfis', 'rail-dailies']);
  });

  test('collapsed: icons only, the same two parts', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/rfis');
    await page.getByRole('button', { name: 'Collapse the tool rail' }).click();
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-inspections', 'rail-files']);
    await expect(page.getByTestId('rail-rfis')).toHaveAttribute('title', 'RFIs');
    await expect(page.getByTestId('rail-rfis')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('job-rail-label')).toHaveAttribute('title', 'Sample Job A');
    await page.getByTestId('rail-board').click();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'board');
    await page.getByRole('button', { name: 'Show the tool names' }).click();
    await expect(page.getByTestId('job-rail-label')).toHaveText('Sample Job A');
  });

  test('phone: the bar follows the job\'s choice, made from More', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Uses the phone bar.');
    await signIn(page, 'pm');
    await page.goto('/all/board');
    await page.getByTestId('phone-tab-more').click();
    await expect(page.getByTestId('phone-more-edit')).toHaveCount(0);

    await page.goto('/p/job-a/board');
    await page.getByTestId('phone-tab-more').click();
    await page.getByTestId('phone-more-edit').click();
    const sheet = page.getByTestId('phone-job-tools');
    await sheet.getByTestId('job-tool-show-dailies').click();
    await expect(sheet.getByTestId('job-tool-show-dailies')).toBeChecked();
    await sheet.getByTestId('job-tool-up-dailies').click();
    await sheet.getByTestId('job-tool-up-dailies').click();
    await sheet.getByTestId('job-tool-up-dailies').click();
    await sheet.getByTestId('job-tools-done').click();
    await expect(sheet).toHaveCount(0);
    await expect
      .poll(() => tabIds(page))
      .toEqual(['phone-tab-board', 'phone-tab-calendar', 'phone-tab-dailies', 'phone-tab-rfis', 'phone-tab-more']);

    await page.goto('/p/job-b/board');
    await expect
      .poll(() => tabIds(page))
      .toEqual(['phone-tab-board', 'phone-tab-calendar', 'phone-tab-rfis', 'phone-tab-inspections', 'phone-tab-more']);
  });
});
