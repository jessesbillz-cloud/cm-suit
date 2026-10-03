// The OFS request on a job with revs (0056) against the e2e mock (job-s, Sample Science Building): a link from Revs
// prefills the wall and item buttons (ui/ChipPick: aria-pressed), three items at most (OSFM: three colors on a sheet),
// the map opens right after sending and one stroke saves itself; then the deputy fails one wall (a reason first) and
// passes the rest. The map PDF and its download are server-only, so Make map here only marks the map as made.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

const WALLS = ['mock-rev-area-4', 'mock-rev-area-5'];
// Rev 3 (Drywall): First Side - First Layer, Second Layer, Fire Tape, then Second Side - First Layer.
const ITEMS = ['mock-rev-item-3-1', 'mock-rev-item-3-2', 'mock-rev-item-3-3', 'mock-rev-item-3-4'];

const cell = (area: number, item: number) => `rev-cell-mock-rev-area-${String(area)}-mock-rev-item-3-${String(item)}`;

test.describe('OFS request with revs', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'sub');
    });
  });

  test('prefilled from Revs, the map drawn, then the deputy fails one wall', async ({ page }) => {
    await page.goto(`/p/job-s/inspections/new?areas=${WALLS.join(',')}&items=${ITEMS.join(',')}`);
    await expect(page.getByTestId('rev-picker')).toBeVisible();
    await expect(page.getByTestId('ir-kind-ofs')).toHaveAttribute('aria-checked', 'true');
    for (const w of WALLS) await expect(page.getByTestId(`rev-wall-${w}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rev-wall-mock-rev-area-1')).toHaveAttribute('aria-pressed', 'false');

    // The first three items in list order; a fourth (in any rev) can't be picked until one comes off.
    for (const i of ITEMS.slice(0, 3)) await expect(page.getByTestId(`rev-item-${i}`)).toHaveAttribute('aria-pressed', 'true');
    const fourth = page.getByTestId('rev-item-mock-rev-item-3-4');
    await expect(fourth).toHaveAttribute('aria-pressed', 'false');
    await expect(fourth).toBeDisabled();
    await expect(page.getByTestId('rev-item-mock-rev-item-6-1')).toBeDisabled();
    await page.getByTestId('rev-item-mock-rev-item-3-3').click();
    await expect(fourth).toBeEnabled();
    await page.getByTestId('rev-item-mock-rev-item-3-3').click();
    await expect(fourth).toBeDisabled();
    await expect(page.getByTestId('rev-title')).toHaveText(
      /^IR new - OFS IR #new - PH III - \d{4}-\d{2}-\d{2} - Level 02 First Side - First Layer & First Side - Second Layer & First Side - Fire Tape$/,
    );
    await expect(page.getByTestId('sheet-name')).toHaveText('Sample A-102 Level 02 Floor Plan.pdf');

    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();

    // The map, right away: the request's three colors; one stroke saves itself; then Make map.
    await expect(page.getByTestId('ir-receipt-ofs')).toHaveText(/^OFS IR #\d{4}$/);
    const n = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');
    await expect(page.getByTestId('markup-color-3')).toContainText('First Side - Fire Tape');
    const frame = page.getByTestId('sheet-frame');
    await expect(frame).toBeVisible({ timeout: 15_000 });
    await frame.scrollIntoViewIfNeeded();
    const box = await frame.boundingBox();
    if (box === null) throw new Error('The sheet has no box.');
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('markup-undo')).toBeEnabled();
    await expect(page.getByTestId('ir-map-save')).toContainText('Saved');
    await page.getByTestId('ir-map-make').click();
    await expect(page.getByTestId('ir-map-download')).toBeEnabled();
    await expect(page.getByTestId('ir-map-make')).toBeDisabled();

    // The deputy: Fail on one wall needs a reason before anything saves; the rest pass; the request is not approved.
    await page.evaluate(() => {
      window.localStorage.setItem('e2e-mock-user', 'inspector');
    });
    await page.goto(`/p/job-s/inspections/mock-ir-${n}`);
    await expect(page.getByTestId('rev-results')).toBeVisible();
    await expect(page.getByTestId('rev-left')).toHaveText('6 left');
    await page.getByTestId(`${cell(4, 1)}-failed`).click();
    for (const [area, item] of [[5, 1], [4, 2], [5, 2], [4, 3], [5, 3]] as const) {
      await page.getByTestId(`${cell(area, item)}-passed`).click();
    }
    await expect(page.getByTestId('rev-left')).toHaveText('1 left');
    await expect(page.getByTestId('ir-outcome')).toHaveCount(0);
    const why = page.getByTestId('rev-note-mock-rev-area-4-mock-rev-item-3-1');
    await why.fill('Sample screws too far apart');
    await why.blur();
    await expect(page.getByTestId('ir-outcome')).toContainText('Not approved');
    await expect(page.getByTestId(`${cell(4, 1)}-failed`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`${cell(5, 3)}-passed`)).toHaveAttribute('aria-checked', 'true');
    await expect(why).toHaveValue('Sample screws too far apart');
  });

  test('an item passed on every picked wall is done and cannot be picked', async ({ page }) => {
    await page.goto('/p/job-s/inspections/new?areas=mock-rev-area-1,mock-rev-area-2&items=mock-rev-item-0-1,mock-rev-item-1-3');
    const tow = page.getByTestId('rev-item-mock-rev-item-0-1');
    await expect(tow).toBeDisabled();
    await expect(tow).toHaveAttribute('aria-pressed', 'false');
    await expect(tow).toHaveAttribute('data-done', 'true');
    await expect(page.getByTestId('rev-item-mock-rev-item-1-3')).toHaveAttribute('aria-pressed', 'true');
  });
});
