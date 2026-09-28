// Settings > Layout, Calendar subscriptions and Notify me about (SPEC §7.2, §7.6, §7.8) against the e2e mock data layer.
// Runs on desktop and phone. Contract with the mock: 'pm' starts from the layout defaults (every rail tool in order,
// opens on Board, right column Board, the quiet notification set) and job-a has "Sample OAC meeting" this week.
// Test ids: layout-rail-up-<tool>, layout-rail-show-<tool>, layout-preview-rail and layout-preview-phone (children carry
// data-tool, in order), layout-preview-right (data-panel), layout-docked-<panel>, cal-sub-<kind>, notify-parent-<area>,
// notify-<event>; layout-card, cal-subs and notify-tree carry data-version (the saved row's version); the frame's
// phone-tab-<tool> and rail-<tool>.
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

function isIndeterminate(box: Locator): Promise<boolean> {
  return box.evaluate((el) => (el as HTMLInputElement).indeterminate);
}

test.describe('settings layout (SPEC §7.2)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('moving a rail tool up changes the preview, the phone bar and the frame', async ({ page }, testInfo) => {
    await page.goto('/p/job-a/settings');
    const card = page.getByTestId('layout-card');
    const rail = page.getByTestId('layout-preview-rail');
    const phone = page.getByTestId('layout-preview-phone');
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'files', 'bids', 'calendar']);

    await clickAndSave(page.getByTestId('layout-rail-up-dailies'), card);
    await expect
      .poll(() => toolsIn(rail))
      .toEqual(['board', 'files', 'bids', 'dailies', 'calendar', 'inspections', 'deliveries', 'corrections', 'people', 'settings']);
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'files', 'bids', 'dailies']);

    if (testInfo.project.name === 'phone') {
      await expect(page.getByTestId('phone-tab-dailies')).toBeVisible();
      await expect(page.getByTestId('phone-tab-calendar')).toHaveCount(0);
    } else {
      const frameRail = page.getByRole('navigation', { name: 'Tools' }).locator('[data-testid^="rail-"]');
      await expect(frameRail.nth(3)).toHaveAttribute('data-testid', 'rail-dailies');
      await clickAndSave(page.getByTestId('layout-docked-none'), card);
      await expect(page.getByTestId('layout-preview-right')).toHaveAttribute('data-panel', 'none');
    }

    // Hiding a tool takes it off the rail and the phone bar; it survives a reload.
    await clickAndSave(page.getByTestId('layout-rail-show-bids'), card);
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'files', 'dailies', 'calendar']);
    await page.reload();
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'files', 'dailies', 'calendar']);
    await expect(page.getByTestId('layout-rail-show-bids')).not.toBeChecked();
  });

  test('a notification parent sets all of its events and shows a dash when some are on', async ({ page }) => {
    await page.goto('/p/job-a/settings');
    const tree = page.getByTestId('notify-tree');
    const parent = page.getByTestId('notify-parent-inspections');
    const confirmed = page.getByTestId('notify-ir_confirmed');
    const results = page.getByTestId('notify-ir_results');
    const events = [confirmed, page.getByTestId('notify-ir_moved'), results];

    // The quiet default: only "Results in".
    await expect(results).toBeChecked();
    await expect(confirmed).not.toBeChecked();
    await expect.poll(() => isIndeterminate(parent)).toBe(true);

    await clickAndSave(parent, tree);
    for (const e of events) await expect(e).toBeChecked();
    await expect.poll(() => isIndeterminate(parent)).toBe(false);

    await clickAndSave(parent, tree);
    for (const e of events) await expect(e).not.toBeChecked();
    await expect(parent).not.toBeChecked();

    await page.reload();
    await expect(results).not.toBeChecked();
    await expect(page.getByTestId('notify-task_assigned')).toBeChecked();
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
