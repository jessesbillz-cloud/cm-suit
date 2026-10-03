// Revs (migration 0056) against the e2e mock. Sample Science Building (job-s) has one list (the eight revs of a fire
// marshal job), six walls on Level 01 and Level 02, and three OFS requests (src/data/mock/revSeeds.ts): TOW passed on
// the three Level 01 walls (IR 5), HOW cavity stuff and spray on two of them with spray failed on Corridor 110 (IR 6),
// and CJ requested on two Level 02 walls (IR 7). 'pm' reads and requests; 'inspector' also manages (revs.manage).
// Test ids: rev-view-<view>, rev-wall-<area> (a tile; data-failed), rev-wall-page (the wall's own page), rev-wall-name,
// rev-wall-progress (data-passed / data-needed), rev-wall-3d (the drawing; data-focus = the part shown; each part a
// [data-part] with data-state), wall3d-label, rev-facts (data-status), rev-item-<item> (a button; aria-pressed when
// picked, data-focus when shown, its dot [data-status]), rev-ir-link, rev-item-note, rev-na, rev-request (data-count),
// rev-open-item-<item> (data-count), rev-open-wall (data-status), rev-new-list, rev-list-new, rev-list-name,
// rev-legend, rev-legend-error, rev-legend-preview, rev-preview-rev, rev-list-create, rev-setup.
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

  test("walls are tiles with their tally; a wall's own page fills the main area and points at its next item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The main area beside the docked panel is the desktop frame; the phone has its own test.');
    await openAs(page, 'pm', '/p/job-s/revs');
    await expect(page.getByTestId('rev-view-setup')).toHaveCount(0);

    const corridor = page.getByTestId('rev-wall-mock-rev-area-2');
    await expect(corridor).toContainText('Corridor 110 north wall');
    await expect(corridor).toContainText('2 of 21 passed');
    await expect(corridor).toHaveAttribute('data-failed', 'true');

    await corridor.click();
    await expect(page).toHaveURL(/\/p\/job-s\/revs\/mock-rev-area-2/);
    const wall = page.getByTestId('main-area').getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-wall-name')).toHaveText('Corridor 110 north wall B / 2–5');
    await expect(wall.getByTestId('rev-wall-progress')).toHaveAttribute('data-passed', '2');
    await expect(page.getByTestId('right-column').getByTestId('rev-wall-page')).toHaveCount(0);

    // The 3-D wall: parts tinted by state; it opens on the next item to ask for (the failed spray), with why.
    const drawing = wall.getByTestId('rev-wall-3d');
    await expect(drawing.locator('[data-part="deck_flutes"]')).toHaveAttribute('data-state', 'passed');
    await expect(drawing.locator('[data-part="head_of_wall_cavity"]')).toHaveAttribute('data-state', 'failed');
    await expect(drawing).toHaveAttribute('data-focus', 'head_of_wall_cavity');
    await expect(drawing.getByTestId('wall3d-label')).toHaveText('HOW Cavity Spray');
    await expect(wall.getByTestId('rev-item-mock-rev-item-1-2')).toHaveAttribute('data-focus', 'true');
    await expect(wall.getByTestId('rev-item-mock-rev-item-1-2').locator('[data-status]')).toHaveAttribute('data-status', 'failed');
    const facts = wall.getByTestId('rev-facts');
    await expect(facts).toHaveAttribute('data-status', 'failed');
    await expect(facts.getByTestId('rev-item-note')).toHaveText('Sample gaps at the deflection track');
    await expect(facts.getByTestId('rev-ir-link')).toContainText('IR 6 · OFS 0006');
    await expect(wall.getByTestId('rev-na')).toHaveCount(0);
  });

  test('a tap shows an item on the wall and picks it; three at most; a tap on the wall shows its part; Request carries them', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-2');
    const wall = page.getByTestId('rev-wall-page');
    const drawing = wall.getByTestId('rev-wall-3d');
    const request = wall.getByTestId('rev-request');
    await expect(request).toBeDisabled();

    const firstLayer = wall.getByTestId('rev-item-mock-rev-item-3-1');
    await firstLayer.click();
    await expect(firstLayer).toHaveAttribute('aria-pressed', 'true');
    await expect(drawing).toHaveAttribute('data-focus', 'board_s1_l1');
    await expect(drawing.getByTestId('wall3d-label')).toHaveText('First Side - First Layer');
    await expect(wall.getByTestId('rev-facts')).toHaveAttribute('data-status', 'open');

    // A passed item is shown, not picked.
    await wall.getByTestId('rev-item-mock-rev-item-0-1').click();
    await expect(drawing).toHaveAttribute('data-focus', 'deck_flutes');
    await expect(wall.getByTestId('rev-item-mock-rev-item-0-1')).toHaveAttribute('aria-pressed', 'false');

    await wall.getByTestId('rev-item-mock-rev-item-1-3').click();
    await wall.getByTestId('rev-item-mock-rev-item-1-2').click();
    await expect(request).toHaveAttribute('data-count', '3');
    const fourth = wall.getByTestId('rev-item-mock-rev-item-2-1');
    await fourth.click();
    await expect(fourth).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('3 items at most on one request.')).toBeVisible();

    // Tapping the drawing: the electrical box is BOX Caulking.
    await drawing.locator('[data-part="box"]').click();
    await expect(drawing).toHaveAttribute('data-focus', 'box');
    await expect(drawing.getByTestId('wall3d-label')).toHaveText('BOX Caulking');
    await expect(wall.getByTestId('rev-item-mock-rev-item-6-3')).toHaveAttribute('data-focus', 'true');

    await request.click();
    await expect(page).toHaveURL(/\/p\/job-s\/inspections\/new\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('areas')).toBe('mock-rev-area-2');
    // In list order: the order the request colors them in.
    expect(url.searchParams.get('items')).toBe('mock-rev-item-1-2,mock-rev-item-1-3,mock-rev-item-3-1');
  });

  test("an item's request opens in Inspections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-1');
    const wall = page.getByTestId('rev-wall-page');
    await wall.getByTestId('rev-item-mock-rev-item-0-1').click();
    await expect(wall.getByTestId('rev-facts')).toHaveAttribute('data-status', 'passed');
    await wall.getByTestId('rev-facts').getByTestId('rev-ir-link').click();
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
    await expect(page.getByTestId('rev-wall-page').getByTestId('rev-wall-name')).toHaveText('Shaftwall at Stair 2 C–D / 3–4');
  });

  test('phone: the walls, then a wall as its own screen; the drawing stays in view while the items scroll', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone only.');
    await openAs(page, 'pm', '/p/job-s/revs');
    await page.getByTestId('rev-wall-mock-rev-area-1').click();
    const wall = page.getByTestId('rev-wall-page');
    const drawing = wall.getByTestId('rev-wall-3d');
    await expect(drawing).toBeVisible();
    const request = wall.getByTestId('rev-request');
    await expect(request).toBeDisabled();

    await wall.getByTestId('rev-item-mock-rev-item-2-1').click();
    await expect(drawing).toHaveAttribute('data-focus', 'control_joint');
    await expect(request).toBeEnabled();
    await expect(request).toHaveAttribute('data-count', '1');

    // The last item, far down: the drawing is still on screen to show it.
    await wall.getByTestId('rev-item-mock-rev-item-7-1').click();
    await expect(drawing).toHaveAttribute('data-focus', 'whole_wall');
    await expect(drawing).toBeInViewport();
    await expect(request).toBeInViewport();
  });

  test('a manager marks the shown item N/A for a wall, and Undo puts it back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-2');
    const wall = page.getByTestId('rev-wall-page');
    const beams = wall.getByTestId('rev-item-mock-rev-item-1-3');
    await beams.click();
    await expect(wall.getByTestId('rev-wall-3d')).toHaveAttribute('data-focus', 'beam_pockets');
    await expect(beams.locator('[data-status]')).toHaveAttribute('data-status', 'open');
    await wall.getByTestId('rev-na').click();
    await expect(beams.locator('[data-status]')).toHaveAttribute('data-status', 'na');
    await expect(wall.getByTestId('rev-wall-3d').locator('[data-part="beam_pockets"]')).toHaveAttribute('data-state', 'na');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(beams.locator('[data-status]')).toHaveAttribute('data-status', 'open');
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
