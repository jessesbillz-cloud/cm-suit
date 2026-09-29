// Settings > Layout, Calendar subscriptions and Notify me about (SPEC §7.2, §7.6, §7.8) against the e2e mock data layer.
// Runs on desktop and phone. Contract with the mock: 'pm' starts from the layout defaults (no pins: the rail is the
// PM's recommendation on job-a, Board, Calendar, RFIs, Inspections, Files (0040); opens on Board, right column Board,
// the quiet notification set) and job-a has "Sample OAC meeting" this week.
// Test ids: layout-rail-up-<tool>, layout-rail-show-<tool>, layout-rail-recommended (while unpinned),
// layout-rail-use-recommended (once pinned), layout-preview-rail and layout-preview-phone (children carry data-tool, in
// order), layout-preview-right (data-panel), layout-docked-<panel>, cal-sub-<kind>, notify-parent-<area>,
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

  test('the rail starts as my position\'s tools; moving one pins my own list; "Use recommended" goes back', async ({ page }, testInfo) => {
    await page.goto('/p/job-a/settings');
    const card = page.getByTestId('layout-card');
    const rail = page.getByTestId('layout-preview-rail');
    const phone = page.getByTestId('layout-preview-phone');
    await expect(page.getByTestId('layout-rail-recommended')).toBeVisible();
    await expect.poll(() => toolsIn(rail)).toEqual(['board', 'calendar', 'rfis', 'inspections', 'files', 'settings']);
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'calendar', 'rfis', 'inspections']);
    await expect(page.getByTestId('layout-rail-show-dailies')).not.toBeChecked();

    await clickAndSave(page.getByTestId('layout-rail-up-files'), card);
    await expect.poll(() => toolsIn(rail)).toEqual(['board', 'calendar', 'rfis', 'files', 'inspections', 'settings']);
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'calendar', 'rfis', 'files']);
    await expect(page.getByTestId('layout-rail-recommended')).toHaveCount(0);
    await expect(page.getByTestId('layout-rail-use-recommended')).toBeVisible();

    if (testInfo.project.name === 'phone') {
      await expect(page.getByTestId('phone-tab-files')).toBeVisible();
      await expect(page.getByTestId('phone-tab-inspections')).toHaveCount(0);
    } else {
      const frameRail = page.getByRole('navigation', { name: 'Tools' }).locator('[data-testid^="rail-"]');
      await expect(frameRail.nth(3)).toHaveAttribute('data-testid', 'rail-files');
      await clickAndSave(page.getByTestId('layout-docked-none'), card);
      await expect(page.getByTestId('layout-preview-right')).toHaveAttribute('data-panel', 'none');
    }

    // Hiding a tool takes it off the rail and the phone bar; showing one adds it at the end; both survive a reload.
    await clickAndSave(page.getByTestId('layout-rail-show-calendar'), card);
    await clickAndSave(page.getByTestId('layout-rail-show-dailies'), card);
    await expect.poll(() => toolsIn(rail)).toEqual(['board', 'rfis', 'files', 'inspections', 'dailies', 'settings']);
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'rfis', 'files', 'inspections']);
    await page.reload();
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'rfis', 'files', 'inspections']);
    await expect(page.getByTestId('layout-rail-show-calendar')).not.toBeChecked();
    await expect(page.getByTestId('layout-rail-show-dailies')).toBeChecked();

    // Back to my position's tools.
    await clickAndSave(page.getByTestId('layout-rail-use-recommended'), card);
    await expect(page.getByTestId('layout-rail-recommended')).toBeVisible();
    await expect.poll(() => toolsIn(rail)).toEqual(['board', 'calendar', 'rfis', 'inspections', 'files', 'settings']);
    await page.reload();
    await expect.poll(() => toolsIn(phone)).toEqual(['board', 'calendar', 'rfis', 'inspections']);
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
