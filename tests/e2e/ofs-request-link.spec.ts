// The revs request from the QR / link with no login (0057) against the e2e mock (job-s, Sample Science Building): the
// members' Revs picker (wall buttons, then up to three item buttons, the sheet among the picked walls' sheets), the
// map drawn right after sending by the receipt (marks save themselves, another page of the plan set clears them with
// Undo, Make map), and the status link showing the map with Download and Edit map. The mock user 'anon' has no
// session; the mock sheet is a synthetic three-page set. The map PDF is server-only, so Make map here only marks the
// map as made.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const TOKEN = 'sample-request-token-sample-request-token-1';

async function drawStroke(page: Page): Promise<void> {
  const frame = page.getByTestId('sheet-frame');
  await expect(frame).toBeVisible({ timeout: 15_000 });
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox();
  if (box === null) throw new Error('The sheet has no box.');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
}

test.describe('OFS request with revs from the link, no login', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'anon');
    });
  });

  test('a visitor picks walls and items, sends, draws the map, and finds it on the status link', async ({ page }) => {
    await page.goto(`/r/job-s?t=${TOKEN}`);
    await expect(page.getByTestId('public-job')).toHaveText('Sample Science Building');
    await expect(page.getByTestId('rev-picker')).toBeVisible();
    await expect(page.getByTestId('public-kind-ofs')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('public-items')).toHaveCount(0);

    // Nothing picked: the items wait for walls. Two walls on Level 02 (one sheet: nothing to pick), then one on
    // Level 01 too: the sheet is one of theirs.
    await expect(page.getByTestId('rev-item-mock-rev-item-3-1')).toHaveCount(0);
    await expect(page.getByTestId('rev-title')).toHaveCount(0);
    await page.getByTestId('rev-wall-mock-rev-area-4').click();
    await page.getByTestId('rev-wall-mock-rev-area-5').click();
    await expect(page.getByTestId('rev-wall-mock-rev-area-5')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rev-item-mock-rev-item-3-1')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('rev-item-mock-rev-item-3-1').click();
    await page.getByTestId('rev-item-mock-rev-item-3-2').click();
    await expect(page.getByTestId('rev-item-mock-rev-item-3-2')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rev-title')).toHaveText(
      /^IR new - OFS IR #new - PH III - \d{4}-\d{2}-\d{2} - Level 02 First Side - First Layer & First Side - Second Layer$/,
    );
    await expect(page.getByTestId('public-sheet-job-s-plan-a102')).toHaveCount(0);
    await page.getByTestId('rev-wall-mock-rev-area-1').click();
    await expect(page.getByTestId('public-sheet-job-s-plan-a101')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('public-sheet-job-s-plan-a102').click();
    await expect(page.getByTestId('public-sheet-job-s-plan-a102')).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('public-name').fill('Sample Foreman');
    await page.getByTestId('public-company').fill('Sample Drywall Co');
    await page.getByTestId('public-phone').fill('555 010 2030');
    await expect(page.getByTestId('public-submit')).toBeDisabled();
    await page.getByTestId('public-ack').check();
    await page.getByTestId('public-submit').click();

    // The receipt, and the map right under it: the request's colors, the picked sheet, page 1 of the set.
    await expect(page.getByTestId('public-receipt')).toBeVisible();
    const number = ((await page.getByTestId('public-ir-number').textContent()) ?? '').replace('IR ', '');
    const map = page.getByTestId('public-map');
    await expect(map.getByTestId('markup-color-2')).toContainText('First Side - Second Layer');
    await expect(map.getByTestId('map-sheet-job-s-plan-a102')).toHaveAttribute('aria-checked', 'true');
    await expect(map.getByTestId('map-page')).toHaveValue('1', { timeout: 15_000 });
    await expect(map.getByTestId('map-page').locator('option')).toHaveCount(3);

    // One stroke saves itself; page 2 clears it, Undo brings page 1 and the stroke back.
    await drawStroke(page);
    await expect(map.getByTestId('markup-undo')).toBeEnabled();
    await expect(map.getByTestId('ir-map-save')).toContainText('Saved');
    await map.getByTestId('map-page-next').click();
    await expect(map.getByTestId('map-page')).toHaveValue('2');
    await expect(map.getByTestId('markup-clear')).toBeDisabled();
    await page.getByRole('status').filter({ hasText: 'Page changed. Marks cleared.' }).getByRole('button', { name: 'Undo' }).click();
    await expect(map.getByTestId('map-page')).toHaveValue('1');
    await expect(map.getByTestId('markup-clear')).toBeEnabled();
    await expect(map.getByTestId('ir-map-save')).toContainText('Saved');
    await map.getByTestId('ir-map-make').click();
    await expect(map.getByTestId('ir-map-download')).toBeEnabled();
    await expect(map.getByTestId('ir-map-make')).toBeDisabled();

    // The status link: the request and its map, read-only with Download; Edit map until the inspector's result.
    await page.getByTestId('public-status-open').click();
    await expect(page).toHaveURL(/\/r\/job-s\/s\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByTestId('public-status')).toContainText(`IR ${number}`);
    const status = page.getByTestId('public-map');
    await expect(status.getByTestId('sheet-frame')).toBeVisible({ timeout: 15_000 });
    await expect(status.getByTestId('markup-undo')).toHaveCount(0);
    await expect(status.getByTestId('ir-map-download')).toBeEnabled();
    await status.getByTestId('ir-map-edit').click();
    await expect(status.getByTestId('map-page')).toHaveValue('1', { timeout: 15_000 });
    await expect(status.getByTestId('markup-clear')).toBeEnabled();
  });

  test('a job without revs keeps the typed request', async ({ page }) => {
    await page.goto(`/r/job-a?t=${TOKEN}`);
    await expect(page.getByTestId('public-items')).toBeVisible();
    await expect(page.getByTestId('rev-picker')).toHaveCount(0);
  });
});
