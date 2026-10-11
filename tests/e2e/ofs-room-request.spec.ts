// An OFS request from a room (Jesse, Oct 10, for the fire marshal's demo) against the e2e mock (job-s, Sample Science
// Building; src/data/mock/revRooms.ts: room 110 Corridor on Level 01 holds the corridor's north wall, mock-rev-area-2,
// and the stair shaftwall, mock-rev-area-1). The room's Request inspection opens the form with every wall of the room
// picked; what to inspect comes first, items with their short names under "Rev N · name", the limit said once; the
// walls below, a tap takes one off, Add walls shows the rest of the list. An OFS request starts on the next working day,
// and the sub's one I confirm states the job's attestation and the notice (no box). The receipt files another like this
// in one tap: same walls, items, time and answer, the next working day. The fire marshal records All passed without
// Confirm first. Mock users: 'sub' asks, 'pm' is the GC, 'inspector' routes, 'ahj' is the fire marshal's deputy.
// Test ids: rev-room-request (the room page's button), rev-items-pick, rev-items-max, rev-walls-pick, rev-walls-more,
// ir-attest-notice, ir-again (the receipt's File another like this).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const NOTICE = "24 hours notice (48 for special). I'll be present, with safe access and plans on site.";
const NORTH = 'mock-rev-area-2';
const SHAFT = 'mock-rev-area-1';
// Rev 3 (Drywall): First Side - First Layer, First Side - Second Layer.
const ITEMS = ['mock-rev-item-3-1', 'mock-rev-item-3-2'];

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

/** Today on the job's clock (Pacific time), as the date field takes it. */
function jobToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** The first Monday to Friday after a day. */
function nextWorkingDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function receiptNumber(page: Page): Promise<string> {
  await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
  return ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');
}

/** From Revs as the sub: room 110, then Request inspection. */
async function requestRoom(page: Page): Promise<void> {
  await page.goto('/');
  await openAs(page, 'sub', '/p/job-s/revs');
  await page.getByTestId('rev-rooms').getByTestId('rev-room-mock-room-110').click();
  await page.getByTestId('rev-room-request').click();
  await expect(page.getByTestId('rev-picker')).toBeVisible();
}

test.describe('OFS request from a room', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('every wall picked, items first; one wall off; one statement; then file another like this', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The request opens in the right column of the desktop frame.');
    test.setTimeout(60_000);
    await requestRoom(page);
    await expect(page).toHaveURL(new RegExp(`areas=${NORTH}(%2C|,)${SHAFT}`));
    await expect(page.getByTestId('ir-kind-ofs')).toHaveAttribute('aria-checked', 'true');
    for (const w of [NORTH, SHAFT]) await expect(page.getByTestId(`rev-wall-${w}`)).toHaveAttribute('aria-pressed', 'true');
    // Only the room's walls until Add walls.
    await expect(page.getByTestId('rev-wall-mock-rev-area-3')).toHaveCount(0);

    // What to inspect comes first, the limit said once; short names; passed on every picked wall: done, greyed.
    const items = await page.getByTestId('rev-items-pick').boundingBox();
    const walls = await page.getByTestId('rev-walls-pick').boundingBox();
    expect(items && walls && items.y < walls.y).toBe(true);
    await expect(page.getByTestId('rev-items-max')).toHaveText('Pick up to 3');
    const stuff = page.getByTestId('rev-item-mock-rev-item-1-1');
    await expect(stuff).toContainText('Stuff');
    await expect(stuff).not.toContainText('HOW');
    await expect(stuff).toHaveAttribute('data-done', 'true');
    await expect(stuff).toBeDisabled();

    // Prefilled: the next working day, Flexible, 1 hr; no notice box for the sub.
    const first = nextWorkingDay(jobToday());
    await expect(page.getByTestId('ir-date')).toHaveValue(first);
    await expect(page.getByTestId('ir-time')).toHaveValue('flexible');
    await expect(page.getByTestId('ir-length')).toHaveValue('60');
    await expect(page.getByTestId('ir-ack')).toHaveCount(0);

    for (const i of ITEMS) await page.getByTestId(`rev-item-${i}`).click();
    // Wall by wall: the shaftwall off. Add walls shows the rest of the list.
    await page.getByTestId(`rev-wall-${SHAFT}`).click();
    await expect(page.getByTestId(`rev-wall-${SHAFT}`)).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('rev-walls-more').click();
    await expect(page.getByTestId('rev-wall-mock-rev-area-3')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('rev-walls-more')).toHaveCount(0);

    // One statement: the job's attestation and the notice, one I confirm.
    await page.getByTestId('ir-special-required-no').click();
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-attest-text')).toBeVisible();
    await expect(page.getByTestId('ir-attest-notice')).toHaveText(NOTICE);
    await page.getByTestId('ir-attest-confirm').click();
    const n = Number(await receiptNumber(page));

    // File another like this: the same walls, items and answer, the next working day; Request, I confirm.
    await page.getByTestId('ir-again').click();
    await expect(page.getByTestId(`rev-wall-${NORTH}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`rev-wall-${SHAFT}`)).toHaveAttribute('aria-pressed', 'false');
    for (const i of ITEMS) await expect(page.getByTestId(`rev-item-${i}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('ir-special-required-no')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('ir-date')).toHaveValue(nextWorkingDay(first));
    await page.getByTestId('ir-submit').click();
    await page.getByTestId('ir-attest-confirm').click();
    expect(Number(await receiptNumber(page))).toBe(n + 1);

    // The first request carries the north wall only.
    await page.goto(`/p/job-s/inspections/mock-ir-${String(n)}`);
    const cells = page.getByTestId('ir-pane').getByTestId('rev-cells');
    await expect(cells).toContainText('Corridor 110 north wall');
    await expect(cells).not.toContainText('Shaftwall');
  });

  test('the fire marshal records All passed without confirming first', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    test.setTimeout(60_000);
    await requestRoom(page);
    await page.getByTestId(`rev-item-${ITEMS[0] ?? ''}`).click();
    await page.getByTestId('ir-special-required-no').click();
    await page.getByTestId('ir-submit').click();
    await page.getByTestId('ir-attest-confirm').click();
    const n = await receiptNumber(page);
    await openAs(page, 'pm', `/p/job-s/inspections/mock-ir-${n}`);
    await page.getByTestId('ofs-gc-check').click();
    await expect(page.getByTestId('ir-gc')).toHaveCount(0);
    await openAs(page, 'inspector', `/p/job-s/inspections/mock-ir-${n}`);
    await page.getByTestId('ir-send-ofs').click();
    await expect(page.getByTestId('ir-with-ofs')).toBeVisible();

    await openAs(page, 'ahj', `/p/job-s/inspections/mock-ir-${n}`);
    const pane = page.getByTestId('ir-pane');
    await expect(pane.getByTestId('ir-confirm')).toBeVisible();
    await pane.getByTestId('rev-all-passed').click();
    await expect(pane.getByTestId('ir-tracker')).toContainText('Confirmed');
    await expect(pane.getByTestId('ir-outcome')).toContainText('Approved');
    await expect(pane.getByTestId('ir-confirm')).toHaveCount(0);
    await expect(pane.getByTestId('rev-all-passed')).toBeDisabled();
  });

  test('on a phone: the room button fills the width, the form fits; the fire marshal has no button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone width (390).');
    await page.goto('/');
    await openAs(page, 'sub', '/p/job-s/revs');
    await page.getByTestId('rev-rooms').getByTestId('rev-room-mock-room-110').click();
    const button = page.getByTestId('rev-room-request');
    await expect(button).toBeInViewport();
    const box = await button.boundingBox();
    expect(box !== null && box.width > 300 && box.height >= 44).toBe(true);
    await button.click();
    await expect(page.getByTestId('rev-items-pick')).toBeInViewport();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide).toBeLessThanOrEqual(0);

    await openAs(page, 'ahj', '/p/job-s/revs/room-mock-room-110');
    await expect(page.getByTestId('rev-room-name')).toHaveText('110 Corridor');
    await expect(page.getByTestId('rev-room-request')).toHaveCount(0);
  });
});
