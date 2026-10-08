// Revs (migration 0056) against the e2e mock. Sample Science Building (job-s) has one list (the eight revs of a fire
// marshal job), six walls on Level 01 and Level 02, and three OFS requests (src/data/mock/revSeeds.ts): TOW passed on
// the three Level 01 walls (IR 5), HOW cavity stuff and spray on two of them with spray failed on Corridor 110 (IR 6),
// and CJ requested on two Level 02 walls (IR 7). 'pm' reads and requests; 'inspector' also manages (revs.manage). An
// OFS request answers one question before it is sent (0061: ir-special-required-<yes|no>).
// Test ids: rev-view-<view>, rev-wall-<area> (a tile; data-failed), rev-wall-page (the wall's own page), rev-wall-name,
// rev-wall-progress (data-passed / data-needed), rev-wall-3d (the drawing; data-focus = the part shown; each part a
// [data-part] with data-state), wall3d-label, rev-facts (data-status), rev-item-<item> (a button; aria-pressed when
// picked, data-focus when shown, its dot [data-status]), rev-ir-link, rev-item-note, rev-na, rev-request (data-count),
// rev-open-item-<item> (data-count), rev-open-wall (data-status), rev-new-list, rev-list-new, rev-list-name,
// rev-legend, rev-legend-error, rev-legend-preview, rev-preview-rev, rev-list-create, rev-setup.
// The plan (0059): rev-view-<list|plan>, rev-plan (data-level), rev-level-<level> (Oct 6), plan-sheet (data-page), each
// drawn wall a [data-wall] (its second line in its color), plan-wall-<area> (its callout; data-focus), plan-add-wall,
// plan-draw-bar (data-points), plan-prompt, plan-done, plan-wall-name, plan-wall-save, rev-wall-thumb, rev-wall-place.
// The synthetic plan set (mock/sheet) has every wall but Level 02's electrical wall drawn on it, Level 02 on page 2.
// Oct 4 audit: sheet-full / sheet-exit (data-full on the frame), sheet-zoom (+ / - / sheet-fit; sheet-frame data-zoom),
// plan-download, rev-wall-sheet (opens the plan) and rev-wall-sheet-download, rev-wall-edit / rev-wall-remove,
// rev-add-rev, plan-open-setup, sheet-clear, rev-sheet-more, rev-sheet-superseded, rev-wall-back.
// Oct 5 (0082): rev-wall-<tag|rating|ul|fire-area|sheet-ref|check>-input, rev-wall-details, rev-wall-check(-note),
// rev-wall-tag (a tile's), rev-before (an item), rev-before-rev (a rev's line), rev-before-form, rev-before-ofs / -date /
// -note, rev-before-line, rev-before-clear, rev-view-checklist, rev-checklist, rev-check-table, rev-check-row-<area>,
// rev-check-<rev number> (data-mark), rev-check-total-<rev number>, rev-print.
// Oct 6 (level first, rev strips): rev-level-<level> / rev-level-all (the level chips; aria-pressed), rev-meta (the
// header's per-list line), rev-wall-open (a tile's open button), rev-strip / rev-wall-strip (a wall's revs), each chip
// rev-chip-<rev number> (data-mark done|requested|failed|open|na; data-file when its OFS IR is on file), rev-ir-line (an
// IR the reader may not open: plain text).
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

/** A tap on the plan's frame (fractions of it): a click, or a finger on the phone. */
async function tapPlan(page: Page, fx: number, fy: number, phone: boolean): Promise<void> {
  const frame = page.getByTestId('sheet-frame');
  await frame.scrollIntoViewIfNeeded();
  const b = await frame.boundingBox();
  if (b === null) throw new Error('The plan has no frame.');
  const [x, y] = [b.x + b.width * fx, b.y + b.height * fy];
  if (phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. */
async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.goto('/');
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  try {
    await page.goto(path);
  } catch (e) {
    // The first page of a test can reload itself once (a new build taking over) while this navigation starts.
    if (!String(e).includes('interrupted by another navigation')) throw e;
    await page.waitForLoadState();
    await page.goto(path);
  }
}

test.describe('revs', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test("walls are tiles with their tally; a wall's own page fills the main area and points at its next item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The main area beside the docked panel is the desktop frame; the phone has its own test.');
    await openAs(page, 'pm', '/p/job-s/revs?view=list');
    await expect(page.getByTestId('rev-view-setup')).toHaveCount(0);
    // The first level by default; the header counts per list.
    await expect(page.getByTestId('rev-level-Level 01')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rev-meta')).toHaveText('Sample Rated Walls 6 · 0 complete');
    await expect(page.getByTestId('rev-wall-mock-rev-area-4')).toHaveCount(0);

    const corridor = page.getByTestId('rev-wall-mock-rev-area-2');
    await expect(corridor).toContainText('Corridor 110 north wall');
    await expect(corridor).toHaveAttribute('data-failed', 'true');
    // Its revs: TOW passed (IR 5, OFS 0005), HOW cavity spray failed, the rest open, in the list's order.
    const strip = corridor.getByTestId('rev-strip');
    await expect(strip.locator('[data-mark]')).toHaveCount(8);
    await expect(strip.getByTestId('rev-chip-0')).toHaveAttribute('data-mark', 'done');
    await expect(strip.getByTestId('rev-chip-0')).toHaveText('0 · 0005');
    await expect(strip.getByTestId('rev-chip-1')).toHaveAttribute('data-mark', 'failed');
    await expect(strip.getByTestId('rev-chip-2')).toHaveAttribute('data-mark', 'open');

    await corridor.getByTestId('rev-wall-open').click();
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
    // Level 01 first: TOW passed on all three of its walls, so it is not open there.
    await expect(page.getByTestId('rev-level-Level 01')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rev-open-item-mock-rev-item-2-1')).toHaveAttribute('data-count', '3');
    await expect(page.getByTestId('rev-open-item-mock-rev-item-0-1')).toHaveCount(0);
    await page.getByTestId('rev-level-all').click();
    await expect(page).toHaveURL(/view=open.*level=all/);
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
    await openAs(page, 'pm', '/p/job-s/revs?view=list');
    await page.getByTestId('rev-wall-mock-rev-area-1').getByTestId('rev-wall-open').click();
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

  test("Plan: a level's sheet with its walls in their colors; a wall opens its page, whose thumbnail opens the plan on it", async ({ page }) => {
    await openAs(page, 'pm', '/p/job-s/revs');
    await page.getByTestId('rev-view-plan').click();
    const plan = page.getByTestId('rev-plan');
    await expect(plan).toHaveAttribute('data-level', 'Level 01');
    await expect(plan.locator('[data-wall]')).toHaveCount(3);
    // Corridor 110: HOW cavity spray failed (red); the shaftwall: nothing failed or asked for (grey).
    await expect(plan.locator('[data-wall="mock-rev-area-2"] polyline').nth(1)).toHaveAttribute('stroke', 'var(--status-not_approved-solid)');
    await expect(plan.locator('[data-wall="mock-rev-area-1"] polyline').nth(1)).toHaveAttribute('stroke', 'var(--status-step_ahead-fg)');
    await expect(page.getByTestId('plan-add-wall')).toHaveCount(0);

    // Level 02 is page 2 of the set; CJ is asked for on two walls (gold); the electrical wall isn't on the plan. A plan
    // is one level: no All.
    await expect(page.getByTestId('rev-level-all')).toHaveCount(0);
    await page.getByTestId('rev-level-Level 02').click();
    await expect(plan).toHaveAttribute('data-level', 'Level 02');
    await expect(page.getByTestId('plan-sheet')).toHaveAttribute('data-page', '2');
    await expect(plan.locator('[data-wall]')).toHaveCount(2);
    await expect(plan.locator('[data-wall="mock-rev-area-5"] polyline').nth(1)).toHaveAttribute('stroke', 'var(--status-pending-dot)');

    await plan.getByTestId('plan-wall-mock-rev-area-5').click();
    await expect(page).toHaveURL(/\/p\/job-s\/revs\/mock-rev-area-5/);
    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-wall-name')).toHaveText('Corridor 210 north wall B / 2–5');
    await wall.getByTestId('rev-wall-thumb').click();
    await expect(page).toHaveURL(/view=plan.*wall=mock-rev-area-5/);
    await expect(page.getByTestId('plan-wall-mock-rev-area-5')).toHaveAttribute('data-focus', 'true');
  });

  test('a manager adds walls on the plan: two taps, Done, a name; the next one starts at once; Undo takes it off', async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    await openAs(page, 'inspector', '/p/job-s/revs?view=plan&level=Level%2002');
    const plan = page.getByTestId('rev-plan');
    await expect(plan.locator('[data-wall]')).toHaveCount(2);
    await plan.getByTestId('plan-add-wall').click();
    await expect(plan.getByTestId('plan-prompt')).toHaveText('Tap the start');
    await expect(plan.getByTestId('plan-done')).toBeDisabled();
    await tapPlan(page, 0.3, 0.25, phone);
    await expect(plan.getByTestId('plan-prompt')).toHaveText('Tap the end');
    await tapPlan(page, 0.62, 0.25, phone);
    await expect(plan.getByTestId('plan-draw-bar')).toHaveAttribute('data-points', '2');
    await plan.getByTestId('plan-done').click();

    const name = plan.getByTestId('plan-wall-name');
    await expect(name).toBeFocused();
    await name.fill('Electrical 0242 north (grid 7)');
    await plan.getByTestId('plan-wall-save').click();
    await expect(page.getByText('Electrical 0242 north added.')).toBeVisible();
    await expect(plan.locator('[data-wall]')).toHaveCount(3);
    await expect(plan.getByTestId('plan-prompt')).toHaveText('Tap the start');

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(plan.locator('[data-wall]')).toHaveCount(2);
  });

  test('a manager places a wall that is not on the plan yet, from its page', async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-6');
    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-wall-thumb')).toHaveCount(0);
    await wall.getByTestId('rev-wall-place').click();
    await expect(page).toHaveURL(/view=plan.*place=mock-rev-area-6/);
    const plan = page.getByTestId('rev-plan');
    await expect(plan.getByTestId('plan-draw-bar')).toContainText('Electrical 205 east wall');
    await expect(page.getByTestId('plan-sheet')).toHaveAttribute('data-page', '2');
    await tapPlan(page, 0.5, 0.3, phone);
    await tapPlan(page, 0.5, 0.6, phone);
    await plan.getByTestId('plan-done').click();
    await expect(page.getByText('Electrical 205 east wall placed.')).toBeVisible();
    await expect(page).toHaveURL(/wall=mock-rev-area-6/);
    await expect(page.getByTestId('plan-wall-mock-rev-area-6')).toHaveAttribute('data-focus', 'true');
  });

  test('the plan goes full screen with its walls, zoom and Download; Exit or Escape comes back', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    await openAs(page, 'ahj', '/p/job-s/revs?view=plan');
    const sheet = page.getByTestId('plan-sheet');
    await expect(page.getByTestId('rev-plan').locator('[data-wall]')).toHaveCount(3);
    await sheet.getByTestId('sheet-full').click();
    await expect(sheet).toHaveAttribute('data-full', 'true');
    await expect(sheet).toContainText('Sample A-101 Floor Plan');
    await expect(sheet.locator('[data-wall]')).toHaveCount(3);
    // + / - and Fit, always there, phones too (Oct 5).
    const frame = sheet.getByTestId('sheet-frame');
    await expect(sheet.getByTestId('sheet-zoom')).toBeVisible();
    if (!desktop) {
      // A phone opens the plan as tall as the frame, across the walls (0059); Fit shows the whole sheet.
      await expect(frame).not.toHaveAttribute('data-zoom', '1.00');
      await sheet.getByTestId('sheet-fit').click();
    }
    await expect(frame).toHaveAttribute('data-zoom', '1.00');
    await sheet.getByRole('button', { name: 'Zoom in' }).click();
    await expect(frame).toHaveAttribute('data-zoom', '1.50');
    await sheet.getByTestId('sheet-fit').click();
    await expect(frame).toHaveAttribute('data-zoom', '1.00');
    if (desktop) {
      const download = page.waitForEvent('download');
      await sheet.getByTestId('plan-download').click();
      expect((await download).suggestedFilename()).toBe('Sample A-101 Floor Plan.pdf');
      await page.keyboard.press('Escape');
    } else {
      await sheet.getByTestId('sheet-exit').click();
    }
    await expect(sheet).not.toHaveAttribute('data-full', 'true');
    await expect(page.getByTestId('sheet-exit')).toHaveCount(0);
  });

  test("the wall's sheet name opens the plan at the wall, with Download beside it", async ({ page }, testInfo) => {
    await openAs(page, 'ahj', '/p/job-s/revs/mock-rev-area-5');
    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-wall-sheet')).toHaveText('Sample A-102 Level 02 Floor Plan.pdf');
    if (testInfo.project.name === 'desktop') {
      const download = page.waitForEvent('download');
      await wall.getByTestId('rev-wall-sheet-download').click();
      expect((await download).suggestedFilename()).toBe('Sample A-102 Level 02 Floor Plan.pdf');
    }
    await wall.getByTestId('rev-wall-sheet').click();
    await expect(page).toHaveURL(/view=plan.*wall=mock-rev-area-5/);
    await expect(page.getByTestId('plan-wall-mock-rev-area-5')).toHaveAttribute('data-focus', 'true');
  });

  test('a manager renames and removes a wall from its own page, with Undo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-5');
    const wall = page.getByTestId('rev-wall-page');
    await expect(page.getByTestId('rev-wall-back')).toBeVisible();
    await wall.getByTestId('rev-wall-edit').click();
    await wall.getByTestId('rev-wall-name-input').fill('Corridor 210 south wall (B / 2–5)');
    await wall.getByTestId('rev-form-save').click();
    await expect(wall.getByTestId('rev-wall-name')).toHaveText('Corridor 210 south wall B / 2–5');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(wall.getByTestId('rev-wall-name')).toHaveText('Corridor 210 north wall B / 2–5');

    // Back to the wall's level.
    await wall.getByTestId('rev-wall-remove').click();
    await expect(page).toHaveURL(/\/p\/job-s\/revs\?level=Level(%20|\+)02$/);
    await page.getByTestId('rev-view-list').click();
    await expect(page.getByTestId('rev-wall-mock-rev-area-4')).toBeVisible();
    await expect(page.getByTestId('rev-wall-mock-rev-area-5')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('rev-wall-mock-rev-area-5')).toBeVisible();
  });

  test("a wall in its own window has no way back to a list it isn't in", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A phone has no windows.');
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-1?window=1');
    await expect(page.getByTestId('rev-wall-page')).toBeVisible();
    await expect(page.getByTestId('rev-wall-back')).toHaveCount(0);
  });

  test('Setup: Add rev on a list, and Up / Down as one save, each with Undo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs?view=setup');
    const setup = page.getByTestId('rev-setup');
    await setup.getByTestId('rev-add-rev').click();
    await expect(setup.getByTestId('rev-rev-number')).toHaveValue('8');
    await setup.getByTestId('rev-rev-name').fill('Sample Penetrations');
    await setup.getByTestId('rev-form-save').click();
    await expect(setup.getByTestId('rev-setup-rev-8')).toContainText('Rev 8 · Sample Penetrations');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(setup.getByTestId('rev-setup-rev-8')).toHaveCount(0);

    const how = setup.getByTestId('rev-setup-rev-1');
    const names = how.locator('[data-testid^="rev-setup-item-"]');
    await expect(names).toHaveText([/^HOW Cavity Stuff/, /^HOW Cavity Spray/, /^HOW Beam Pockets/]);
    await how.getByRole('button', { name: 'Move HOW Beam Pockets up' }).click();
    await expect(names).toHaveText([/^HOW Cavity Stuff/, /^HOW Beam Pockets/, /^HOW Cavity Spray/]);
    await expect(page.getByText('HOW Beam Pockets moved up.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(names).toHaveText([/^HOW Cavity Stuff/, /^HOW Cavity Spray/, /^HOW Beam Pockets/]);
  });

  test("the sheet picker: No sheet, N more, and a superseded stamped sheet says so", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs?view=setup');
    await page.getByTestId('rev-setup-wall-mock-rev-area-1').getByTestId('rev-setup-edit').click();
    const form = page.getByTestId('rev-wall-form');
    await expect(form.getByTestId('sheet-name')).toHaveText('Sample A-101 Floor Plan.pdf');
    await form.getByTestId('sheet-clear').click();
    await expect(form.getByTestId('sheet-name')).toHaveCount(0);
    await expect(form.getByTestId('rev-sheet')).toHaveCount(8);
    await form.getByTestId('rev-sheet-more').click();
    await expect(form.getByTestId('rev-sheet').filter({ has: page.getByTestId('rev-sheet-superseded') })).toHaveCount(1);
    await form.getByTestId('rev-sheet').filter({ hasText: 'Sample A-102 Level 02 Floor Plan.pdf' }).click();
    await expect(form.getByTestId('sheet-name')).toHaveText('Sample A-102 Level 02 Floor Plan.pdf');
  });

  test('Plan with no lists offers Open Setup to a manager', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs?view=setup');
    await page.getByRole('button', { name: 'Remove Sample Rated Walls' }).click();
    await expect(page.getByText('No lists yet.')).toBeVisible();
    await page.getByTestId('rev-view-rooms').click();
    await page.getByTestId('rev-view-plan').click();
    await page.getByTestId('plan-open-setup').click();
    await expect(page).toHaveURL(/view=setup/);
  });

  test("a request's map draws its walls from the plan, one mark per wall and item", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The map opens in the right column.');
    await openAs(page, 'sub', '/p/job-s/inspections/new?areas=mock-rev-area-4,mock-rev-area-5&items=mock-rev-item-3-1,mock-rev-item-3-2');
    await page.getByTestId('ir-special-required-no').click();
    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();
    await page.getByTestId('ir-attest-confirm').click();
    await expect(page.getByTestId('sheet-frame')).toBeVisible({ timeout: 15_000 });
    // Two walls x two items, on page 2 of the set where the walls are; saved like any mark.
    await expect(page.getByTestId('sheet-frame').locator('svg path')).toHaveCount(4);
    await expect(page.getByTestId('map-page')).toHaveValue('2');
    await expect(page.getByTestId('ir-map-save')).toContainText('Saved');
    // The map goes full screen with its colors, and comes back with Escape.
    await page.getByTestId('ir-map').getByTestId('sheet-full').click();
    await expect(page.getByTestId('sheet-exit')).toBeVisible();
    await expect(page.getByTestId('sheet-frame').locator('svg path')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sheet-exit')).toHaveCount(0);
  });
  test("a manager sets a wall's details: one line under its name, a Check chip with the note, the tag on its tile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-5');
    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-wall-details')).toHaveCount(0);
    await wall.getByTestId('rev-wall-edit').click();
    await wall.getByTestId('rev-wall-tag-input').fill('F6a');
    await wall.getByTestId('rev-wall-rating-input').fill('1 HR');
    await wall.getByTestId('rev-wall-ul-input').fill('UL U419');
    await wall.getByTestId('rev-wall-fire-area-input').fill('Fire Area 2');
    await wall.getByTestId('rev-wall-sheet-ref-input').fill('A201A');
    await wall.getByTestId('rev-wall-check-input').fill('Sample head of wall joint');
    await wall.getByTestId('rev-form-save').click();
    await expect(wall.getByTestId('rev-wall-details')).toHaveText('F6a · 1 HR · UL U419 · Fire Area 2 · A201A');
    await expect(wall.getByTestId('rev-wall-check-note')).toHaveCount(0);
    await wall.getByTestId('rev-wall-check').click();
    await expect(wall.getByTestId('rev-wall-check-note')).toHaveText('Sample head of wall joint');
    await page.getByTestId('rev-wall-back').click();
    await page.getByTestId('rev-view-list').click();
    await expect(page.getByTestId('rev-wall-mock-rev-area-5').getByTestId('rev-wall-tag')).toHaveText('F6a');
  });

  test('a manager signs an item and a whole rev off before the app, each with Undo; others see them done', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-2');
    const wall = page.getByTestId('rev-wall-page');
    const beams = wall.getByTestId('rev-item-mock-rev-item-1-3');
    await beams.click();
    await wall.getByTestId('rev-before').click();
    await wall.getByTestId('rev-before-ofs').fill('41');
    await wall.getByTestId('rev-before-date').fill('2026-09-21');
    await wall.getByTestId('rev-before-note').fill('Sample paper IR');
    await wall.getByTestId('rev-form-save').click();
    await expect(beams.locator('[data-status]')).toHaveAttribute('data-status', 'passed');
    await expect(wall.getByTestId('rev-facts')).toContainText('Done');
    await expect(wall.getByTestId('rev-before-line')).toHaveText('OFS #0041 · Sep 21');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(beams.locator('[data-status]')).toHaveAttribute('data-status', 'open');

    // A whole rev at once: CJ's two items; Undo takes both back.
    const stuffing = wall.getByTestId('rev-item-mock-rev-item-2-1');
    const caulking = wall.getByTestId('rev-item-mock-rev-item-2-2');
    await wall.getByTestId('rev-section-2').getByTestId('rev-before-rev').click();
    await wall.getByTestId('rev-before-ofs').fill('52');
    await wall.getByTestId('rev-form-save').click();
    await expect(stuffing.locator('[data-status]')).toHaveAttribute('data-status', 'passed');
    await expect(caulking.locator('[data-status]')).toHaveAttribute('data-status', 'passed');
    await expect(wall.getByTestId('rev-section-2').getByTestId('rev-before-rev')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(stuffing.locator('[data-status]')).toHaveAttribute('data-status', 'open');
    await expect(caulking.locator('[data-status]')).toHaveAttribute('data-status', 'open');

    // Signed off again, then Clear on the item, and its Undo puts the same sign-off back.
    await wall.getByTestId('rev-section-2').getByTestId('rev-before-rev').click();
    await wall.getByTestId('rev-before-ofs').fill('52');
    await wall.getByTestId('rev-form-save').click();
    await stuffing.click();
    await expect(wall.getByTestId('rev-before-line')).toHaveText('OFS #0052');
    await wall.getByTestId('rev-before-clear').click();
    await expect(stuffing.locator('[data-status]')).toHaveAttribute('data-status', 'open');
    // Clear's own toast: its Undo comes once the wall has refreshed, after the re-sign's toast still on screen.
    await page.getByRole('status').filter({ hasText: 'not signed off.' }).getByRole('button', { name: 'Undo' }).click();
    await expect(stuffing.locator('[data-status]')).toHaveAttribute('data-status', 'passed');

    // The PM reads it as done, with no sign-off buttons.
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-2');
    await wall.getByTestId('rev-item-mock-rev-item-2-1').click();
    await expect(wall.getByTestId('rev-facts')).toContainText('Done');
    await expect(wall.getByTestId('rev-before-line')).toHaveText('OFS #0052');
    await expect(wall.getByTestId('rev-before')).toHaveCount(0);
    await expect(wall.getByTestId('rev-before-clear')).toHaveCount(0);
    await expect(wall.getByTestId('rev-before-rev')).toHaveCount(0);
  });

  test('Checklist: per level, walls by rev with done, failed, requested, open and totals; a sign-off shows done; it prints', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop frame.');
    await openAs(page, 'inspector', '/p/job-s/revs');
    await page.getByTestId('rev-view-checklist').click();
    const list = page.getByTestId('rev-checklist');
    const row = (n: number) => list.getByTestId(`rev-check-row-mock-rev-area-${String(n)}`);
    await expect(row(1).getByTestId('rev-check-0')).toHaveAttribute('data-mark', 'done');
    await expect(row(1).getByTestId('rev-check-1')).toHaveAttribute('data-mark', 'open');
    await expect(row(1).getByTestId('rev-check-1')).toHaveText('2/3');
    await expect(row(2).getByTestId('rev-check-1')).toHaveAttribute('data-mark', 'failed');
    await expect(row(4).getByTestId('rev-check-2')).toHaveAttribute('data-mark', 'requested');
    const level1 = list.getByTestId('rev-check-table').first();
    await expect(level1.getByTestId('rev-check-total-0')).toHaveText('3/3');
    await expect(level1.getByTestId('rev-check-total-1')).toHaveText('0/3');
    await expect(page.getByTestId('rev-print')).toBeEnabled();

    // Rev 1 signed off before on the elevator shaft: done on the checklist, one of three in the total.
    await row(3).getByRole('button', { name: /Elevator 1 shaft/ }).click();
    const wall = page.getByTestId('rev-wall-page');
    await wall.getByTestId('rev-section-1').getByTestId('rev-before-rev').click();
    await wall.getByTestId('rev-form-save').click();
    await expect(wall.getByTestId('rev-item-mock-rev-item-1-1').locator('[data-status]')).toHaveAttribute('data-status', 'passed');
    await page.getByTestId('rev-wall-back').click();
    await expect(row(3).getByTestId('rev-check-1')).toHaveAttribute('data-mark', 'done');
    await expect(level1.getByTestId('rev-check-total-1')).toHaveText('1/3');

    // The fire marshal reads it too.
    await openAs(page, 'ahj', '/p/job-s/revs?view=checklist');
    await expect(row(3).getByTestId('rev-check-1')).toHaveAttribute('data-mark', 'done');
  });
});
