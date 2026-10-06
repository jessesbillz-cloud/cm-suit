// The OFS request on a job with revs (0056) and its route (0061; SPEC §18.4 P1) against the e2e mock (job-s, Sample
// Science Building, whose own GC step is off): a link from Revs prefills the wall and item buttons (ui/ChipPick:
// aria-pressed), three items at most (OSFM: three colors on a sheet), one question (special inspection required?), the
// map opens right after sending and one stroke saves itself. Then the route: the request waits on the GC (always, on an
// OFS request); the inspector sends it to OFS or postpones it, and never confirms it; once sent it is read only for him
// (Undo until the deputy acts) and the deputy's to confirm and decide wall by wall. The deputy reads the OFS requests
// sent to OFS and nothing else. The inspector's own OFS request goes straight to OFS on his one statement.
// Mock users: 'sub' asks, 'pm' is the GC, 'inspector' routes, 'ahj' is the fire marshal's deputy.
// Test ids: ir-special-required-<yes|no> (and -notice), ir-inspector-ack, ir-review-<n>, ir-gc, ir-ofs-route,
// ir-send-ofs, ir-with-ofs, ir-unsend-ofs, ir-special, ir-inspector (the step cards), ir-queue-<n>, ir-confirm-<n>.
// The map PDF and its download are server-only, so Make map here only marks the map as made.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

const WALLS = ['mock-rev-area-4', 'mock-rev-area-5'];
// Rev 3 (Drywall): First Side - First Layer, Second Layer, Fire Tape, then Second Side - First Layer.
const ITEMS = ['mock-rev-item-3-1', 'mock-rev-item-3-2', 'mock-rev-item-3-3', 'mock-rev-item-3-4'];
const NOTICE = "Have the special inspector's reports on site for the fire marshal.";

const cell = (area: number, item: number) => `rev-cell-mock-rev-area-${String(area)}-mock-rev-item-3-${String(item)}`;

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

/** The number on the receipt of the request just sent. */
async function receiptNumber(page: Page): Promise<string> {
  await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
  return ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');
}

/** A sub's OFS request on one wall and one item, sent with the question answered No. Answers its IR number. */
async function subAsks(page: Page): Promise<string> {
  await page.goto('/p/job-s/inspections/new?areas=mock-rev-area-4&items=mock-rev-item-3-1');
  await expect(page.getByTestId('rev-picker')).toBeVisible();
  await page.getByTestId('ir-special-required-no').click();
  await page.getByTestId('ir-ack').check();
  await page.getByTestId('ir-submit').click();
  await page.getByTestId('ir-attest-confirm').click();
  return receiptNumber(page);
}

/** The GC checks request `n` Ready (0091), then the inspector sends it to OFS. */
async function toOfs(page: Page, n: string): Promise<void> {
  await openAs(page, 'pm', `/p/job-s/inspections/mock-ir-${n}`);
  await page.getByTestId('ofs-gc-check').click();
  await expect(page.getByTestId('ir-gc')).toHaveCount(0);
  await openAs(page, 'inspector', `/p/job-s/inspections/mock-ir-${n}`);
  await page.getByTestId('ir-send-ofs').click();
  await expect(page.getByTestId('ir-with-ofs')).toBeVisible();
}

test.describe('OFS request with revs', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'sub');
    });
  });

  test('prefilled from Revs, the map drawn; through the GC and the inspector, the deputy fails one wall', async ({ page }) => {
    test.setTimeout(60_000);
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

    // One question, nothing preselected, needed to send; Yes shows the notice. A sub states nothing more.
    await page.getByTestId('ir-ack').check();
    await expect(page.getByTestId('ir-submit')).toBeDisabled();
    await expect(page.getByTestId('ir-inspector-ack')).toHaveCount(0);
    await page.getByTestId('ir-special-required-yes').click();
    await expect(page.getByTestId('ir-special-required-notice')).toHaveText(NOTICE);
    await page.getByTestId('ir-submit').click();
    await page.getByTestId('ir-attest-confirm').click();

    // It waits on the GC (this job's own GC step is off: an OFS request takes it anyway). The map, right away: the
    // request's three colors; one stroke saves itself; then Make map.
    await expect(page.getByTestId('ir-receipt-ofs')).toHaveText(/^OFS IR #\d{4}$/);
    const n = await receiptNumber(page);
    await expect(page.getByTestId('ir-receipt')).toContainText('Waiting on the GC.');
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

    // The deputy, once the GC has confirmed it and the inspector has sent it: the step cards (no helper), each wall
    // his once he confirms it. Fail on one wall needs a reason before anything saves; the rest pass; the request is not approved.
    await toOfs(page, n);
    await openAs(page, 'ahj', `/p/job-s/inspections/mock-ir-${n}`);
    const pane = page.getByTestId('ir-pane');
    await expect(pane.getByTestId('ir-inspector')).toBeVisible();
    await expect(pane.getByTestId('ir-confirm')).toBeVisible();
    await expect(pane.getByLabel('Helper')).toHaveCount(0);
    await expect(pane.getByTestId('ir-special')).toContainText(NOTICE);
    // Results wait for Confirm (its own step): the walls are read only until then.
    await expect(page.getByTestId('rev-results')).toHaveCount(0);
    await expect(pane.getByTestId('rev-cells')).toBeVisible();
    await pane.getByTestId('ir-confirm').click();
    await expect(pane.getByTestId('ir-tracker')).toContainText('Confirmed');
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

  test("a sub's request lands in GC review; the inspector sends it to OFS and never confirms it", async ({ page }) => {
    const n = await subAsks(page);
    await expect(page.getByTestId('ir-receipt')).toContainText('GC review');

    // The GC: it is on the review list; his Ready check (0091) passes it to the inspector.
    await openAs(page, 'pm', '/p/job-s/inspections?view=review');
    await page.getByTestId(`ir-review-${n}`).click();
    const pane = page.getByTestId('ir-pane');
    await expect(pane.getByTestId('ir-tracker')).toContainText('OFS');
    await expect(pane.getByTestId('ir-special')).toContainText('No');
    await pane.getByTestId('ofs-gc-check').click();
    await expect(pane.getByTestId('ir-gc')).toHaveCount(0);

    // The inspector: Send to OFS or Postpone. No Confirm, on his day or on the request; no step cards; the walls are
    // read only.
    await openAs(page, 'inspector', `/p/job-s/inspections/mock-ir-${n}?view=day`);
    const row = page.getByTestId(`ir-queue-${n}`);
    await expect(row).toContainText('Pending');
    await expect(page.getByTestId('ir-meta')).toHaveText('Today · 1 request · 1 pending');
    await expect(page.getByTestId(`ir-confirm-${n}`)).toHaveCount(0);
    await expect(pane.getByTestId('ir-send-ofs')).toBeVisible();
    await expect(pane.getByTestId('ir-postpone-open')).toBeVisible();
    await expect(pane.getByTestId('ir-inspector')).toHaveCount(0);
    await expect(pane.getByTestId('ir-confirm')).toHaveCount(0);
    await expect(pane.getByTestId('rev-results')).toHaveCount(0);
    await expect(pane.getByTestId('rev-cells')).toBeVisible();

    // Sent: with OFS. Read only for the inspector, out of his pending count; Undo takes it back until the deputy acts.
    await pane.getByTestId('ir-send-ofs').click();
    await expect(pane.getByTestId('ir-with-ofs')).toHaveText(/With OFS/);
    await expect(pane.getByTestId('ir-send-ofs')).toHaveCount(0);
    await expect(pane.getByTestId('ir-inspector')).toHaveCount(0);
    await expect(row).toContainText('With OFS');
    await expect(page.getByTestId('ir-meta')).toHaveText('Today · 1 request');
    await pane.getByTestId('ir-unsend-ofs').click();
    await expect(row).toContainText('Pending');
    await pane.getByTestId('ir-send-ofs').click();
    await expect(pane.getByTestId('ir-with-ofs')).toBeVisible();

    // The deputy: on his day, pending, with Confirm. Once he confirms, the inspector's Undo is gone.
    await openAs(page, 'ahj', '/p/job-s/inspections');
    await expect(page.getByTestId(`ir-queue-${n}`)).toContainText('Pending');
    await expect(page.getByTestId('ir-meta')).toHaveText('Today · 1 request · 1 pending');
    await page.getByTestId(`ir-confirm-${n}`).click();
    await expect(page.getByTestId(`ir-queue-${n}`)).toContainText('Confirmed');
    await openAs(page, 'inspector', `/p/job-s/inspections/mock-ir-${n}`);
    await expect(pane.getByTestId('ir-with-ofs')).toBeVisible();
    await expect(pane.getByTestId('ir-unsend-ofs')).toHaveCount(0);
  });

  test('the deputy reads the OFS requests sent to OFS, never an IOR request or one still on its way', async ({ page }) => {
    // An IOR request on the same job, today; and an OFS request that stays with the GC.
    await page.goto('/p/job-s/inspections/new');
    await page.getByTestId('ir-items').fill('Sample framing at grid B');
    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();
    const ior = await receiptNumber(page);
    await expect(page.getByTestId('ir-receipt')).toContainText('Waiting on the inspector.');
    const waiting = await subAsks(page);

    // The inspector has both on his day; the IOR one is his to confirm.
    await openAs(page, 'inspector', '/p/job-s/inspections?view=day');
    await expect(page.getByTestId(`ir-confirm-${ior}`)).toBeVisible();

    // The deputy: neither on his day, in his log, nor by its own link. A seeded request sent to OFS is his.
    await openAs(page, 'ahj', '/p/job-s/inspections');
    await expect(page.getByTestId('ir-view-day')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ir-meta')).toHaveText('Nothing today');
    await expect(page.getByTestId(`ir-queue-${ior}`)).toHaveCount(0);
    await expect(page.getByTestId('ir-new')).toHaveCount(0);
    await page.goto('/p/job-s/inspections?view=log');
    await page.getByTestId('ir-log-period-month').click();
    await expect(page.getByTestId('ir-log-count')).toBeVisible();
    await expect(page.getByTestId(`log-row-${ior}`)).toHaveCount(0);
    await expect(page.getByTestId(`log-row-${waiting}`)).toHaveCount(0);
    await expect(page.getByTestId(/^log-row-\d+$/).filter({ hasNotText: 'OFS' })).toHaveCount(0);
    for (const hidden of [`mock-ir-${ior}`, `mock-ir-${waiting}`, 'mock-ir-job-s-4']) {
      await page.goto(`/p/job-s/inspections/${hidden}`);
      await expect(page.getByText("That inspection isn't here.")).toBeVisible();
    }
    await page.goto('/p/job-s/inspections/mock-ir-job-s-3');
    await expect(page.getByTestId('ir-pane').getByTestId('ir-inspector')).toBeVisible();
  });

  test('the inspector files an OFS request on his one statement; it goes straight to OFS', async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'inspector', '/p/job-s/inspections/new?areas=mock-rev-area-4&items=mock-rev-item-3-1');
    await expect(page.getByTestId('rev-picker')).toBeVisible();
    await page.getByTestId('ir-special-required-no').click();
    await page.getByTestId('ir-ack').check();
    await expect(page.getByTestId('ir-submit')).toBeDisabled();
    await page.getByTestId('ir-inspector-ack').check();
    await page.getByTestId('ir-submit').click();
    const n = await receiptNumber(page);
    await expect(page.getByTestId('ir-receipt')).toContainText('With OFS');
    await expect(page.getByTestId('ir-receipt')).toContainText('Waiting on OFS.');

    // It never passed the GC or waited on him: read only, with Undo while the deputy has not acted.
    await page.goto(`/p/job-s/inspections/mock-ir-${n}`);
    const pane = page.getByTestId('ir-pane');
    await expect(pane.getByTestId('ir-with-ofs')).toBeVisible();
    await expect(pane.getByTestId('ir-unsend-ofs')).toBeVisible();
    await expect(pane.getByTestId('ir-inspector')).toHaveCount(0);
    await openAs(page, 'ahj', `/p/job-s/inspections/mock-ir-${n}`);
    await expect(pane.getByTestId('ir-inspector')).toBeVisible();
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
