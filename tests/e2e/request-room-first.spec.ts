// The inspector's own OFS request from Inspections, against the e2e mock (job-s, Sample Science Building;
// src/data/mock/revRooms.ts: room 110 Corridor on Level 01 holds the corridor's north wall, mock-rev-area-2, and the
// stair shaftwall, mock-rev-area-1; the elevator shaft, mock-rev-area-3, is in no room). Jesse, Oct 10: "the entire room
// first, and then if you wanted it, you expand it to just one wall", and "the submit button wouldn't ever highlight".
// Rooms come first, a tap picks the whole room, its Walls show its walls; Request is never a silent grey button: the bar
// says the first thing missing and a tap on Request jumps to it (focused, ringed). One box for the inspector: his
// statement states the notice too.
// Test ids: rev-rooms-pick, rev-pick-room-<room> (aria-pressed true / mixed / false) and -walls (its Walls),
// ir-submit-hint (the bar's words), data-missing="<what is missing>" (where each answer sits).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const NORTH = 'mock-rev-area-2';
const SHAFT = 'mock-rev-area-1';
const ITEM = 'mock-rev-item-3-1';
const READY = 'A request, not a booking.';

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. */
async function openAs(page: Page, who: string, path: string): Promise<void> {
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

/** The inspector's new request, type OFS. */
async function newOfsRequest(page: Page): Promise<void> {
  await page.goto('/');
  await openAs(page, 'inspector', '/p/job-s/inspections/new');
  await page.getByTestId('ir-kind-ofs').click();
  await expect(page.getByTestId('rev-rooms-pick')).toBeVisible();
}

test.describe('request: room first, never a silent grey button', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('the hint says what is missing, the tap jumps to it; a whole room, one wall off; it sends', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    test.setTimeout(60_000);
    await newOfsRequest(page);
    const hint = page.getByTestId('ir-submit-hint');
    const submit = page.getByTestId('ir-submit');

    // Nothing picked: the bar says so, and Request jumps to what to inspect.
    await expect(hint).toHaveText('Pick what to inspect');
    await submit.click();
    const what = page.locator('[data-missing="what"]');
    await expect(what).toHaveClass(/ring-danger/);
    await expect(what.locator(':focus')).toHaveCount(1);
    await expect(page.getByTestId('ir-receipt')).toHaveCount(0);
    await page.getByTestId(`rev-item-${ITEM}`).click();
    await expect(hint).toHaveText('Pick a wall');
    await expect(what).not.toHaveClass(/ring-danger/);

    // Rooms first, by level; the walls in no room under Other walls. A tap picks the whole room.
    const room = page.getByTestId('rev-pick-room-mock-room-110');
    await expect(room).toContainText('110 Corridor');
    await expect(room).toContainText('2 walls');
    await expect(room).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('rev-rooms-pick')).toContainText('Other walls');
    await expect(page.getByTestId('rev-wall-mock-rev-area-3')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId(`rev-wall-${NORTH}`)).toHaveCount(0);
    await room.click();
    await expect(room).toHaveAttribute('aria-pressed', 'true');

    // Its Walls: one taken off; the room reads 1 of 2.
    await page.getByTestId('rev-pick-room-mock-room-110-walls').click();
    for (const w of [NORTH, SHAFT]) await expect(page.getByTestId(`rev-wall-${w}`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId(`rev-wall-${SHAFT}`).click();
    await expect(room).toHaveAttribute('aria-pressed', 'mixed');
    await expect(room).toContainText('1 of 2 walls');

    // The question: the tap jumps to it, Yes focused.
    await expect(hint).toHaveText('Special inspection? Yes or No');
    await submit.click();
    await expect(page.getByTestId('ir-special-required-yes')).toBeFocused();
    await expect(page.locator('[data-missing="special_required"]')).toHaveClass(/ring-danger/);
    await page.getByTestId('ir-special-required-no').click();

    // No company: empty and asked for, never a silent block.
    await page.getByTestId('ir-company').fill('');
    await expect(hint).toHaveText('Add your company');
    await submit.click();
    await expect(page.getByTestId('ir-company')).toBeFocused();
    await page.getByTestId('ir-company').fill('Sample Inspection Co');

    // One box: his statement, with the notice in it.
    await expect(page.getByTestId('ir-ack')).toHaveCount(0);
    await expect(hint).toHaveText('Tick the statement');
    await submit.click();
    await expect(page.getByTestId('ir-inspector-ack')).toBeFocused();
    await page.getByTestId('ir-inspector-ack').check();
    await expect(hint).toHaveText(READY);
    await submit.click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
    await expect(page.getByTestId('ir-receipt')).toContainText('With OFS');
    const n = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');

    // It carries the north wall only.
    await page.goto(`/p/job-s/inspections/mock-ir-${n}`);
    const cells = page.getByTestId('ir-pane').getByTestId('rev-cells');
    await expect(cells).toContainText('Corridor 110 north wall');
    await expect(cells).not.toContainText('Shaftwall');
  });

  test('on a phone: the rooms fit with big targets; the tap jumps to the question', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone width (390).');
    test.setTimeout(60_000);
    await newOfsRequest(page);
    await page.getByTestId(`rev-item-${ITEM}`).click();
    const room = page.getByTestId('rev-pick-room-mock-room-110');
    await room.click();
    await expect(room).toHaveAttribute('aria-pressed', 'true');
    for (const target of [room, page.getByTestId('rev-pick-room-mock-room-110-walls')]) {
      const box = await target.boundingBox();
      expect(box !== null && box.height >= 44).toBe(true);
    }
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide).toBeLessThanOrEqual(0);

    await expect(page.getByTestId('ir-submit-hint')).toHaveText('Special inspection? Yes or No');
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-special-required-yes')).toBeFocused();
    await expect(page.getByTestId('ir-special-required-yes')).toBeInViewport();
    await page.getByTestId('ir-special-required-no').click();
    await page.getByTestId('ir-inspector-ack').check();
    await expect(page.getByTestId('ir-submit-hint')).toHaveText(READY);
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
  });
});
