// One tap for a whole batch at each approval step (migration 0114; Jesse, Oct 23: speed and zero wasted taps) against
// the e2e mock (job-s, Sample Science Building: src/data/mock/revSeeds.ts and revRooms.ts). The sub sends a basket of
// three walls: top of wall on room 205's two walls (Level 02, one sheet page) and cavity spray on room 110's corridor
// wall (Level 01), so two OFS requests in one batch. The GC ('pm') taps Ready all once, the inspector Send all to OFS
// once, and both requests are with the fire marshal ('ahj').
// Test ids: needs-you-batch, batch-step (data-step), batch-open, ir-batch, ir-batch-line, ir-batch-request (data-waits).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const TOW = 'mock-rev-item-0-1';
const SPRAY = 'mock-rev-item-1-2';

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

/** The sub sends three walls as two OFS requests, one batch, both with the GC. */
async function sendBatch(page: Page): Promise<void> {
  await openAs(page, 'sub', '/p/job-s/revs?level=Level%2002');
  await page.getByTestId('rev-room-mock-room-205').click();
  await page.getByTestId(`rev-room-add-${TOW}`).click();
  await expect(page.getByTestId('basket-line')).toHaveText('2 items on 2 walls');
  await openAs(page, 'sub', '/p/job-s/revs/room-mock-room-110');
  await page.getByTestId(`rev-room-add-${SPRAY}`).click();
  await expect(page.getByTestId('basket-bar')).toHaveAttribute('data-count', '3');
  await page.getByTestId('basket-review').click();
  await page.getByTestId('ir-special-required-no').click();
  await page.getByTestId('basket-send').click();
  await page.getByTestId('ir-attest-confirm').click();
  await expect(page.getByTestId('basket-sent')).toHaveAttribute('data-count', '2');
}

test.describe('a batch, one tap per step', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('the GC taps Ready all once, the inspector Send all to OFS once: both requests reach the fire marshal', async ({ page }) => {
    test.setTimeout(90_000);
    await sendBatch(page);

    // The GC: one line in Needs you for the batch.
    await openAs(page, 'pm', '/p/job-s/board');
    const line = page.getByTestId('needs-you-batch');
    await expect(line).toHaveCount(1);
    await expect(line).toContainText('Batch of 2 · Level 01, Level 02');
    const step = line.getByTestId('batch-step');
    await expect(step).toHaveAttribute('data-step', 'gc');
    await expect(step).toHaveText('Ready all (2)');
    await step.click();
    // Done: the GC's step is gone from the line (the mock 'pm' also inspects, so Send is his next).
    await expect(step).not.toHaveAttribute('data-step', 'gc');

    // Open: the first request, whose page lists the batch.
    await line.getByTestId('batch-open').click();
    const panel = page.getByTestId('ir-batch');
    await expect(panel.getByTestId('ir-batch-line')).toContainText('Batch of 2');
    await expect(panel.getByTestId('ir-batch-request')).toHaveCount(2);
    const url = new URL(page.url()).pathname;

    // The inspector: Send all to OFS, once.
    await openAs(page, 'inspector', '/p/job-s/board');
    const send = page.getByTestId('needs-you-batch').getByTestId('batch-step');
    await expect(send).toHaveAttribute('data-step', 'send');
    await expect(send).toHaveText('Send all to OFS (2)');
    await send.click();
    await expect(page.getByTestId('needs-you-batch')).toHaveCount(0);

    // The fire marshal reads both, with nothing of his to tap for the batch.
    await openAs(page, 'ahj', url);
    await expect(page.getByTestId('ir-batch').getByTestId('ir-batch-request')).toHaveCount(2);
    await expect(page.getByTestId('ir-batch').getByTestId('batch-step')).toHaveCount(0);
  });
});
