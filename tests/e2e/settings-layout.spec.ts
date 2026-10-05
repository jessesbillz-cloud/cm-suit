// Settings > Layout and Calendar subscriptions (SPEC §7.2, §7.6) against the e2e mock data layer; Notify me about is
// hidden until push ships (§7.8, §8.6).
// Runs on desktop and phone. Contract with the mock: 'pm' starts from the layout defaults (opens on Board, right column
// Board, the quiet notification set) with no tools of their own on any job, so the rail on job-a is only the job's: the
// PM's recommendation without the Board, then Files: Calendar, RFIs, Inspections, Files (0040, 0051, 0058); on All my
// jobs, Board, Calendar, Bids. job-a has "Sample OAC meeting" this week. A job's tools are chosen on the rail (Edit
// under its name), never in Settings (0051).
// Test ids: layout-preview-rail and layout-preview-phone (children carry data-tool, in order), layout-preview-main
// (data-tool), layout-preview-right (data-panel), layout-main-default, layout-docked-<panel>, cal-sub-<kind>,
// notify-tree (absent); layout-card and cal-subs carry data-version (the saved row's version); the frame's job-rail-edit, job-rail-editor, job-tool-show-<tool>.
import process from 'node:process';
import { expect, test, type Locator } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

function toolsIn(box: Locator): Promise<(string | null)[]> {
  return box.locator('[data-tool]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tool')));
}

/** Clicks and waits until that save has landed (the card's data-version moves), so a reload reads it back. */
async function clickAndSave(target: Locator, card: Locator): Promise<void> {
  const before = (await card.getAttribute('data-version')) ?? '';
  await target.click();
  await expect(card).not.toHaveAttribute('data-version', before);
}

test.describe('settings layout (SPEC §7.2)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('the sketch shows the rail as the frame does; Opens on and the right column save and survive a reload', async ({ page }, testInfo) => {
    await page.goto('/p/job-a/settings');
    const card = page.getByTestId('layout-card');
    const rail = page.getByTestId('layout-preview-rail');
    const phone = page.getByTestId('layout-preview-phone');
    await expect.poll(() => toolsIn(rail)).toEqual(['calendar', 'rfis', 'inspections', 'files', 'settings']);
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'calendar', 'rfis', 'inspections']);
    // One way to choose a job's tools: on the rail, not here.
    await expect(page.getByTestId('layout-rail')).toHaveCount(0);

    // Opens on: the board or the calendar of All my jobs.
    const opens = page.getByTestId('layout-main-default');
    await expect(opens.locator('option')).toHaveText(['Board', 'Calendar']);
    const before = (await card.getAttribute('data-version')) ?? '';
    await opens.selectOption('calendar');
    await expect(card).not.toHaveAttribute('data-version', before);
    await expect(page.getByTestId('layout-preview-main')).toHaveAttribute('data-tool', 'calendar');

    if (testInfo.project.name === 'desktop') {
      await clickAndSave(page.getByTestId('layout-docked-none'), card);
      await expect(page.getByTestId('layout-preview-right')).toHaveAttribute('data-panel', 'none');

      // A tool chosen for the job on the rail shows in the sketch at once.
      await page.getByTestId('job-rail-edit').click();
      await page.getByTestId('job-rail-editor').getByTestId('job-tool-show-dailies').click();
      await expect.poll(() => toolsIn(rail)).toEqual(['calendar', 'rfis', 'inspections', 'files', 'dailies', 'settings']);
      await page.getByTestId('job-tools-done').click();
    }

    await page.reload();
    await expect(page.getByTestId('layout-preview-main')).toHaveAttribute('data-tool', 'calendar');
    await page.goto('/all/settings');
    await expect.poll(() => toolsIn(rail)).toEqual(['board', 'calendar', 'bids', 'settings']);
  });

  test('Notify me about is hidden until push ships', async ({ page }) => {
    await page.goto('/p/job-a/settings');
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(page.getByTestId('notify-tree')).toHaveCount(0);
  });

  test('calendar subscriptions drive what the calendar shows', async ({ page }) => {
    await page.goto('/p/job-a/settings');
    await expect(page.getByRole('heading', { name: 'Calendar subscriptions' })).toBeVisible();
    await expect(page.getByText('Calendar shows')).toHaveCount(0);

    const meetings = page.getByTestId('cal-sub-meetings');
    await expect(meetings).toBeChecked();
    await clickAndSave(meetings, page.getByTestId('cal-subs'));
    await expect(meetings).not.toBeChecked();

    await page.goto('/p/job-a/calendar');
    await expect(page.getByTestId('cal-type-meetings')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Sample OAC meeting')).toHaveCount(0);
  });
});
