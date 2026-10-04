// The rail by position (Jesse, Sep 28: "we have our recommendations based on the type of position you have"). On All my
// jobs, the cross-job tools (Board, Calendar, and Bids / Timesheets when they apply); on a job, only that job (Jesse,
// Oct 3: "once you're on a job, it should all be specific to that job"): its name, its tools chosen per job with Edit,
// every other tool of the job (its Board too) one click away under More, and a count where something needs me.
// Runs only against the e2e mock.
// Contract with the mock (src/data/mock/rail.ts, mock/jobRail.ts): 'pm' has no list of their own, so Sample Job A shows
// the PM's tools under "Sample Job A" (the recommendation without the Board, then Files): Calendar, RFIs, Inspections,
// Files; Board, Bids, Dailies, Deliveries, Corrections, People sit under More. Sample Job B has the same tools. What
// needs 'pm' on job A: task-1 on a file (Files: 1) and RFIs 003 and 004 left with the architect (RFIs: 2). 'inspector'
// gets Calendar, Dailies, Inspections, Corrections, Files under the job's name. Test ids: rail-<tool>, rail-more,
// rail-more-menu, rail-more-<tool>, job-rail (the job's tools; data-version = my saved list's version),
// job-rail-label, job-rail-edit, job-rail-editor, job-tool-show-<tool>, job-tool-up-<tool>, job-tools-recommended,
// job-tools-done, phone-tab-<tool>, phone-tab-more, phone-more-<tool>, phone-more-edit, tool-badge-<tool | more>,
// needs-you-task, main-area (data-tool).
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

  test('desktop: on a job the rail is that job\'s alone: its name, the PM\'s tools, the rest (its Board too) under More', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/board');
    await expect
      .poll(() => railIds(page))
      .toEqual(['rail-calendar', 'rail-rfis', 'rail-inspections', 'rail-files', 'rail-more', 'rail-settings']);
    await expect.poll(() => jobIds(page)).toEqual(['rail-calendar', 'rail-rfis', 'rail-inspections', 'rail-files']);
    await expect(page.getByTestId('job-rail-label')).toHaveText('Sample Job A');
    // The job's board is open (the right column shows it beside every other tool), so More is lit.
    await expect(page.getByTestId('rail-more')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('rail-more').click();
    const menu = page.getByTestId('rail-more-menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Board', 'Bids', 'Dailies', 'Deliveries', 'Corrections', 'Safety', 'Schedule', 'Requirements', 'People']);
    await page.getByTestId('rail-more-dailies').click();
    await expect(page).toHaveURL(/\/p\/job-a\/dailies$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'dailies');
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId('rail-more')).toHaveAttribute('aria-current', 'page');
  });

  test('desktop: an inspector gets the inspector\'s tools, and nothing from All my jobs', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'inspector');
    await page.goto('/p/job-a/board');
    await expect
      .poll(() => jobIds(page))
      .toEqual(['rail-calendar', 'rail-dailies', 'rail-inspections', 'rail-corrections', 'rail-files']);
    await expect(page.getByTestId('rail-board')).toHaveCount(0);
    await expect(page.getByTestId('rail-bids')).toHaveCount(0);
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

  test('phone: the job\'s Board, then the job\'s first tools on the bar; the rest under More, each once', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Uses the phone bar.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/board');
    await expect
      .poll(() => tabIds(page))
      .toEqual(['phone-tab-board', 'phone-tab-calendar', 'phone-tab-rfis', 'phone-tab-inspections', 'phone-tab-more']);
    await page.getByTestId('phone-tab-more').click();
    await expect(page.getByTestId('phone-more-bids')).toBeVisible();
    await expect(page.getByTestId('phone-more-files')).toBeVisible();
    await expect(page.getByTestId('phone-more-board')).toHaveCount(0);
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

test.describe('each job\'s tools, chosen per job (Jesse, Oct 1); on a job, only the job (Oct 3)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('desktop: picking a job swaps the rail for the job\'s; Edit changes that job only', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'pm');
    await page.goto('/all/board');
    await expect(page.getByTestId('rail-board')).toBeVisible();
    await expect(page.getByTestId('job-rail-label')).toHaveCount(0);
    await expect(page.getByTestId('job-rail-edit')).toHaveCount(0);

    // Pick a job: All my jobs' tools go, the job's tools show under its name.
    await pickJob(page, /Sample Job A/);
    await expect(page).toHaveURL(/\/p\/job-a\/board$/);
    await expect(page.getByTestId('job-rail-label')).toHaveText('Sample Job A');
    await expect.poll(() => jobIds(page)).toEqual(['rail-calendar', 'rail-rfis', 'rail-inspections', 'rail-files']);
    await expect(page.getByTestId('rail-board')).toHaveCount(0);
    await expect(page.getByTestId('rail-bids')).toHaveCount(0);

    // Edit: the job's Board and Calendar are choices like any tool. Add Board, take Calendar off, move Files up.
    const part = page.getByTestId('job-rail');
    const editor = page.getByTestId('job-rail-editor');
    await page.getByTestId('job-rail-edit').click();
    await expect(editor.getByTestId('job-tool-show-rfis')).toBeChecked();
    await expect(editor.getByTestId('job-tool-show-board')).not.toBeChecked();
    await expect(editor.getByTestId('job-tools-recommended')).toHaveCount(0);
    // click, not check(): the box follows the saved list a tick after the click.
    await editor.getByTestId('job-tool-show-board').click();
    await expect(editor.getByTestId('job-tool-show-board')).toBeChecked();
    await expect(part).toHaveAttribute('data-version', '1');
    await editor.getByTestId('job-tool-show-calendar').click();
    await expect(editor.getByTestId('job-tool-show-calendar')).not.toBeChecked();
    await expect(part).toHaveAttribute('data-version', '2');
    await editor.getByTestId('job-tool-up-files').click();
    await expect(part).toHaveAttribute('data-version', '3');
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-files', 'rail-inspections', 'rail-board']);
    await editor.getByTestId('job-tools-done').click();
    await expect(editor).toHaveCount(0);

    // What came off is one click away under More.
    await page.getByTestId('rail-more').click();
    await expect(page.getByTestId('rail-more-menu').getByRole('menuitem')).toHaveText([
      'Bids',
      'Calendar',
      'Dailies',
      'Deliveries',
      'Corrections',
      'Safety',
      'Schedule',
      'Requirements',
      'People',
    ]);
    await page.keyboard.press('Escape');

    // Kept after a reload; another job keeps its own list.
    await page.reload();
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-files', 'rail-inspections', 'rail-board']);
    await pickJob(page, /Sample Job B/);
    await expect(page).toHaveURL(/\/p\/job-b\/board$/);
    await expect(page.getByTestId('job-rail-label')).toHaveText('Sample Job B');
    await expect.poll(() => jobIds(page)).toEqual(['rail-calendar', 'rail-rfis', 'rail-inspections', 'rail-files']);

    // Back on job A: Recommended puts my position's tools back, and Undo brings my own list back.
    await pickJob(page, /Sample Job A/);
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-files', 'rail-inspections', 'rail-board']);
    await page.getByTestId('job-rail-edit').click();
    await editor.getByTestId('job-tools-recommended').click();
    await expect.poll(() => jobIds(page)).toEqual(['rail-calendar', 'rail-rfis', 'rail-inspections', 'rail-files']);
    await expect(editor.getByTestId('job-tools-recommended')).toHaveCount(0);
    await editor.getByTestId('job-tools-done').click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => jobIds(page)).toEqual(['rail-rfis', 'rail-files', 'rail-inspections', 'rail-board']);
  });

  test('collapsed: icons only, the job\'s name a thin line', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/rfis');
    await page.getByRole('button', { name: 'Collapse the tool rail' }).click();
    await expect.poll(() => jobIds(page)).toEqual(['rail-calendar', 'rail-rfis', 'rail-inspections', 'rail-files']);
    await expect(page.getByTestId('rail-rfis')).toHaveAttribute('title', 'RFIs');
    await expect(page.getByTestId('rail-rfis')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('job-rail-label')).toHaveAttribute('title', 'Sample Job A');
    await page.getByTestId('rail-calendar').click();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'calendar');
    await page.getByRole('button', { name: 'Show the tool names' }).click();
    await expect(page.getByTestId('job-rail-label')).toHaveText('Sample Job A');
  });

  test('a short window: More\'s menu and the Edit panel stay inside it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await page.setViewportSize({ width: 1377, height: 520 });
    await signIn(page, 'pm');
    await page.goto('/p/job-a/rfis');
    const inside = async (testId: string) => {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, `${testId} is drawn`).not.toBeNull();
      expect(box?.y ?? -1, `${testId} starts inside the window`).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0), `${testId} ends inside the window`).toBeLessThanOrEqual(520);
    };
    await page.getByTestId('rail-more').click();
    await inside('rail-more-menu');
    await page.keyboard.press('Escape');
    await page.getByTestId('job-rail-edit').click();
    await inside('job-rail-editor');
    await expect(page.getByTestId('job-tools-done')).toBeInViewport();
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
