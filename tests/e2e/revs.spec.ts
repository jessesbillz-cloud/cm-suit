// Revs (migration 0056) against the e2e mock. Sample Science Building (job-s) has one list (the eight revs of a fire
// marshal job), six walls on Level 01 and Level 02, and three OFS requests (src/data/mock/revSeeds.ts): TOW passed on
// the three Level 01 walls (IR 5), HOW cavity stuff and spray on two of them with spray failed on Corridor 110 (IR 6),
// and CJ requested on two Level 02 walls (IR 7). 'pm' reads and requests; 'inspector' also manages (revs.manage).
// Test ids: rev-view-<view>, rev-wall-<area> (a row), rev-wall-steps / rev-wall-tracker (each rev a <li> with
// data-state done / current / todo / failed and data-kind = its number), rev-wall-pane, rev-wall-name,
// rev-item-<item> (data-status), rev-ir-link, rev-item-note, rev-na, rev-request, rev-open-item-<item> (data-count),
// rev-open-wall (data-status), rev-new-list, rev-list-new, rev-list-name, rev-legend, rev-legend-error,
// rev-legend-preview, rev-preview-rev, rev-list-create, rev-setup.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

const LEGEND = `Rev. 0 - TOW
TOW - Speed Plugs (Sample Firestop)

Rev. 1 - HOW - Cavity
HOW Cavity Stuff (Sample Firestop)
HOW Cavity Spray (Sample Firestop)
Rev 2 – CJ
CJ Stuffing (Sample Firestop)
CJ Caulking`;

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. */
async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.goto('/');
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto(path);
}

test.describe('revs', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test("walls show their trackers; a wall opens with its items; Request carries the wall and its next items", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame; the phone has its own test.');
    await openAs(page, 'pm', '/p/job-s/revs');
    await expect(page.getByTestId('rev-view-setup')).toHaveCount(0);

    // Corridor 110: TOW passed, HOW cavity failed, the rest ahead.
    const corridor = page.getByTestId('rev-wall-mock-rev-area-2');
    const steps = corridor.getByTestId('rev-wall-steps').locator('li');
    await expect(steps).toHaveCount(8);
    await expect(steps.nth(0)).toHaveAttribute('data-state', 'done');
    await expect(steps.nth(1)).toHaveAttribute('data-state', 'failed');
    await expect(steps.nth(2)).toHaveAttribute('data-state', 'todo');
    await expect(steps.nth(0)).toHaveAttribute('data-kind', '0');
    // Level 02 shaftwall: CJ is requested.
    await expect(page.getByTestId('rev-wall-mock-rev-area-4').getByTestId('rev-wall-steps').locator('li').nth(2)).toHaveAttribute(
      'data-state',
      'current',
    );

    await corridor.click();
    const pane = page.getByTestId('right-column').getByTestId('rev-wall-pane');
    await expect(pane.getByTestId('rev-wall-name')).toHaveText('Corridor 110 north wall (B / 2–5)');
    await expect(pane.getByTestId('rev-item-mock-rev-item-0-1')).toHaveAttribute('data-status', 'passed');
    const spray = pane.getByTestId('rev-item-mock-rev-item-1-2');
    await expect(spray).toHaveAttribute('data-status', 'failed');
    await expect(spray.getByTestId('rev-item-note')).toHaveText('Sample gaps at the deflection track');
    await expect(spray.getByTestId('rev-ir-link')).toContainText('IR 6 · OFS 0006');
    await expect(pane.getByTestId('rev-na')).toHaveCount(0);

    // The next items: what is left of Rev 1 (the failed spray asks again, then the beam pockets).
    await pane.getByTestId('rev-request').click();
    await expect(page).toHaveURL(/\/p\/job-s\/inspections\/new\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('areas')).toBe('mock-rev-area-2');
    expect(url.searchParams.get('items')).toBe('mock-rev-item-1-2,mock-rev-item-1-3');
  });

  test("an item's request opens in Inspections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-1');
    await page.getByTestId('rev-item-mock-rev-item-0-1').getByTestId('rev-ir-link').click();
    await expect(page).toHaveURL(/\/p\/job-s\/inspections\/mock-ir-revs-5/);
  });

  test('Open: per item, how many walls are still open and which; a tap opens the wall', async ({ page }) => {
    await openAs(page, 'pm', '/p/job-s/revs');
    await page.getByTestId('rev-view-open').click();
    const tow = page.getByTestId('rev-open-item-mock-rev-item-0-1');
    await expect(tow).toHaveAttribute('data-count', '3');
    const stuffing = page.getByTestId('rev-open-item-mock-rev-item-2-1');
    await expect(stuffing).toHaveAttribute('data-count', '6');
    await expect(stuffing.locator('[data-testid="rev-open-wall"][data-status="requested"]')).toHaveCount(2);
    await expect(page.getByTestId('rev-open-item-mock-rev-item-1-2').locator('[data-status="failed"]')).toHaveCount(1);
    await tow.getByTestId('rev-open-wall').first().click();
    await expect(page.getByTestId('rev-wall-pane').getByTestId('rev-wall-name')).toHaveText('Shaftwall at Stair 2 (C–D / 3–4)');
  });

  test('phone: the walls, then a wall full screen with its tracker', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone only.');
    await openAs(page, 'pm', '/p/job-s/revs');
    await page.getByTestId('rev-wall-mock-rev-area-1').click();
    const pane = page.getByTestId('rev-wall-pane');
    await expect(pane.getByTestId('rev-wall-tracker').locator('li')).toHaveCount(8);
    await expect(pane.getByTestId('rev-request')).toBeVisible();
  });

  test('a manager marks an item N/A for a wall, and Undo puts it back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-2');
    const beams = page.getByTestId('rev-wall-pane').getByTestId('rev-item-mock-rev-item-1-3');
    await expect(beams).toHaveAttribute('data-status', 'open');
    await beams.getByTestId('rev-na').click();
    await expect(beams).toHaveAttribute('data-status', 'na');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(beams).toHaveAttribute('data-status', 'open');
  });

  test('a manager pastes the legend, sees what it read before Create, and creates the list', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The form opens in the right column.');
    await openAs(page, 'inspector', '/p/job-s/revs');
    await page.getByTestId('rev-view-setup').click();
    await page.getByTestId('rev-new-list').click();
    const form = page.getByTestId('rev-list-new');
    await form.getByTestId('rev-list-name').fill('Sample Shaft Walls');

    await form.getByTestId('rev-legend').fill(`Sample notes\n${LEGEND}`);
    await expect(form.getByTestId('rev-legend-error')).toHaveText('Line 1: start with a rev, like "Rev 0 - TOW".');
    await expect(form.getByTestId('rev-list-create')).toBeDisabled();

    await form.getByTestId('rev-legend').fill(LEGEND);
    const preview = form.getByTestId('rev-legend-preview');
    await expect(preview.getByTestId('rev-preview-rev')).toHaveCount(3);
    await expect(preview).toContainText('Rev 1 · HOW - Cavity');
    await expect(preview).toContainText('HOW Cavity Spray');
    await form.getByTestId('rev-list-create').click();
    await expect(page.getByTestId('rev-setup')).toContainText('Sample Shaft Walls');
  });
});
