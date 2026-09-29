// The rail by position (Jesse, Sep 28: "we have our recommendations based on the type of position you have"): lean,
// every other tool one click away under More, and a count where something needs me. Runs only against the e2e mock.
// Contract with the mock (src/data/mock/rail.ts): 'pm' has no pins, so Sample Job A shows the PM's tools, Board,
// Calendar, RFIs, Inspections, Files; the job's other tools, Bids, Dailies, Deliveries, Corrections, People, sit under
// More. What needs 'pm' there: task-1 on a file (Files: 1) and RFIs 003 and 004 left with the architect (RFIs: 2).
// 'inspector' gets Board, Calendar, Dailies, Inspections, Corrections, Files. Test ids: rail-<tool>, rail-more,
// rail-more-menu, rail-more-<tool>, phone-tab-<tool>, phone-tab-more, phone-more-<tool>, tool-badge-<tool | more>,
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

test.describe('the rail by position', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('desktop: the PM\'s tools on the rail, the rest of the job under More, one click away', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/board');
    await expect
      .poll(() => railIds(page))
      .toEqual(['rail-board', 'rail-calendar', 'rail-rfis', 'rail-inspections', 'rail-files', 'rail-more', 'rail-settings']);

    await page.getByTestId('rail-more').click();
    const menu = page.getByTestId('rail-more-menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Bids', 'Dailies', 'Deliveries', 'Corrections', 'People']);
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
      .poll(() => railIds(page))
      .toEqual(['rail-board', 'rail-calendar', 'rail-dailies', 'rail-inspections', 'rail-corrections', 'rail-files', 'rail-more', 'rail-settings']);
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

  test('phone: the first four tools on the bar, the job\'s other tools under More', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Uses the phone bar.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/board');
    const tabs = page.getByTestId(/^phone-tab-/);
    await expect
      .poll(() => tabs.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid'))))
      .toEqual(['phone-tab-board', 'phone-tab-calendar', 'phone-tab-rfis', 'phone-tab-inspections', 'phone-tab-more']);
    await page.getByTestId('phone-tab-more').click();
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
