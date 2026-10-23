// Not ready and the easy sign-off (0109; Jesse, Oct 22: "The fire marshal shouldn't have to be responsible for taking
// things off the inspection request that weren't ready or failed. That should be the contractor") against the e2e mock
// (job-s, Sample Science Building; room 110 Corridor holds the corridor's north wall, mock-rev-area-2, and the stair
// shaftwall, mock-rev-area-1). The sub asks for First Side - First Layer on the room, the GC passes it on, the inspector
// sends it to OFS. Then: the sub takes the shaftwall off (one tap, Undo in the toast) and the fire marshal's request no
// longer has it; the fire marshal's boxes all start as Pass, one flipped to Fail asks why, one save; the failed item is
// "Failed — needs re-inspection" on the wall, under Back from OFS on the sub's start page, and first on the next request.
// Mock users: 'sub' asks, 'pm' is the GC, 'inspector' routes, 'ahj' is the fire marshal's deputy.
// Test ids: ir-pull-back, ir-pull-<wall>, ir-pull-wall-<wall>, ir-pull-cell-<wall>-<item>, rev-results, rev-all-passed
// (Pass all, or Save with failures), rev-cell-<wall>-<item> (data-state passed / failed), rev-note-<wall>-<item>.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const NORTH = 'mock-rev-area-2';
const SHAFT = 'mock-rev-area-1';
const ITEM = 'mock-rev-item-3-1';

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

/** The sub asks for First Side - First Layer on room 110; the GC passes it on; the inspector sends it to OFS. Answers
 *  the request's path. */
async function sentToOfs(page: Page): Promise<string> {
  await page.goto('/');
  await openAs(page, 'sub', '/p/job-s/revs');
  await page.getByTestId('rev-rooms').getByTestId('rev-room-mock-room-110').click();
  await page.getByTestId('rev-room-request').click();
  await expect(page.getByTestId('rev-picker')).toBeVisible();
  await page.getByTestId(`rev-item-${ITEM}`).click();
  await page.getByTestId('ir-special-required-no').click();
  await page.getByTestId('ir-submit').click();
  await page.getByTestId('ir-attest-confirm').click();
  await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
  const n = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');
  const path = `/p/job-s/inspections/mock-ir-${n}`;
  await openAs(page, 'pm', path);
  await page.getByTestId('ofs-gc-check').click();
  await expect(page.getByTestId('ir-gc')).toHaveCount(0);
  await openAs(page, 'inspector', path);
  await page.getByTestId('ir-send-ofs').click();
  await expect(page.getByTestId('ir-with-ofs')).toBeVisible();
  return path;
}

test.describe('OFS: Not ready, and the easy sign-off', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('the sub takes a wall off a request with OFS; the fire marshal no longer has it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The request opens in the right column of the desktop frame.');
    test.setTimeout(60_000);
    const path = await sentToOfs(page);

    // The sub: both walls, each with Not ready. The shaftwall off; Undo brings it back; off again.
    await openAs(page, 'sub', path);
    const pane = page.getByTestId('ir-pane');
    await expect(pane.getByTestId('ir-pull-back')).toBeVisible();
    await expect(pane.getByTestId(`ir-pull-${NORTH}`)).toBeVisible();
    await pane.getByTestId(`ir-pull-wall-${SHAFT}`).click();
    await expect(pane.getByTestId(`ir-pull-${SHAFT}`)).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(pane.getByTestId(`ir-pull-${SHAFT}`)).toBeVisible();
    await pane.getByTestId(`ir-pull-wall-${SHAFT}`).click();
    await expect(pane.getByTestId(`ir-pull-${SHAFT}`)).toHaveCount(0);
    await expect(pane.getByTestId(`ir-pull-${NORTH}`)).toBeVisible();

    // The fire marshal: only the north wall to record, and nothing to take off.
    await openAs(page, 'ahj', path);
    await expect(pane.getByTestId('rev-results')).toBeVisible();
    await expect(pane.getByTestId(`rev-cell-${NORTH}-${ITEM}`)).toBeVisible();
    await expect(pane.getByTestId(`rev-cell-${SHAFT}-${ITEM}`)).toHaveCount(0);
    await expect(pane.getByTestId('ir-pull-back')).toHaveCount(0);

    // The shaftwall is open again: the sub can ask for it on a new request.
    await openAs(page, 'sub', `/p/job-s/inspections/new?areas=${SHAFT}&items=${ITEM}`);
    await expect(page.getByTestId(`rev-item-${ITEM}`)).toHaveAttribute('data-state', 'open');
  });

  test('Pass all with one flipped to Fail; the failure comes back to the sub', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The request opens in the right column of the desktop frame.');
    test.setTimeout(60_000);
    const path = await sentToOfs(page);

    // The fire marshal: both boxes Pass to start; one tap flips the north wall to Fail, which asks why.
    await openAs(page, 'ahj', path);
    const pane = page.getByTestId('ir-pane');
    const north = pane.getByTestId(`rev-cell-${NORTH}-${ITEM}`);
    const shaft = pane.getByTestId(`rev-cell-${SHAFT}-${ITEM}`);
    const save = pane.getByTestId('rev-all-passed');
    await expect(north).toHaveAttribute('data-state', 'passed');
    await expect(shaft).toHaveAttribute('data-state', 'passed');
    await expect(save).toHaveText('Pass all');
    await north.click();
    await expect(north).toHaveAttribute('data-state', 'failed');
    await expect(save).toHaveText('Save · 1 failed');
    await expect(save).toBeDisabled();
    await pane.getByTestId(`rev-note-${NORTH}-${ITEM}`).fill('Sample screws too far apart');
    await save.click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('Not approved');
    await expect(save).toBeDisabled();
    await expect(shaft).toHaveAttribute('data-state', 'passed');

    // The wall: Failed — needs re-inspection.
    await openAs(page, 'sub', `/p/job-s/revs/${NORTH}`);
    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId(`rev-item-${ITEM}`)).toHaveAttribute('data-state', 'failed');
    await wall.getByTestId(`rev-item-${ITEM}`).click();
    await expect(wall.getByTestId('rev-facts')).toContainText('Failed — needs re-inspection:');
    await expect(wall.getByTestId('rev-item-note')).toHaveText('Sample screws too far apart');

    // The sub's start page: Back from OFS, Failed, the item itself.
    await openAs(page, 'sub', '/p/job-s/board');
    const back = page.locator('[data-testid="ofs-group"][data-group="back"]');
    await back.getByTestId('ofs-group-head').first().click();
    await page.locator('[data-testid="ofs-group"][data-group="back/failed"]').getByTestId('ofs-group-head').click();
    await expect(page.getByTestId('ofs-desk-row').filter({ hasText: 'Sample screws too far apart' })).toContainText('Corridor 110 north wall');

    // The next request for the room: the room and the item first, as Failed last time.
    await openAs(page, 'sub', '/p/job-s/revs');
    await page.getByTestId('rev-rooms').getByTestId('rev-room-mock-room-110').click();
    await page.getByTestId('rev-room-request').click();
    await expect(page.getByTestId('rev-pick-room-mock-room-110-failed')).toBeVisible();
    const first = page.getByTestId('rev-items-pick').getByRole('group').first();
    await expect(first).toHaveAccessibleName('Failed last time');
    await expect(first.getByTestId(`rev-item-${ITEM}`)).toBeVisible();
  });
});
