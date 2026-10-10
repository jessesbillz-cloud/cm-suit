// Deliveries (SPEC §13.3) against the e2e mock: Sample Job A has a Sample Concrete Co delivery today 7:00-8:00, a
// Sample Lumber one today with its time TBD, and #3 (Sample Steel Co) two days out whose ticket was deleted in Files.
// Posting 7:30 shows the heads-up and lands as Standby on the board; a post for another day shows that day; the
// three weeks hold still under a tapped day; a photo or ticket comes off with Undo; a tap on a tile opens the file
// viewer over the delivery's files (the photo, the ticket's pages, Delete with Undo); Delete knows my name; a month row
// opens its delivery; the Calendar sees a new post at once; TV mode opens with its clock; the delivery link made in
// the Link view prints a poster with its QR code and opens the public board, where a typed name posts a delivery and
// gets a receipt, even where the browser blocks storage. Test ids: delivery-day-<day>, delivery-day-cards,
// delivery-card, delivery-form, delivery-tbd, delivery-duration, delivery-file, delivery-file-remove, delivery-file-view,
// delivery-delete-name, delivery-month-row, delivery-poster, qr-code, cal-kind-deliveries.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** The day `n` days from today on the job's clock (America/Los_Angeles), as yyyy-mm-dd. */
function fromToday(n: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The first day cell of the three-week grid. */
function firstDay(page: Page): Promise<string | null> {
  return page.locator('[data-testid^="delivery-day-2"]').first().getAttribute('data-testid');
}

test.describe('deliveries (SPEC §13.3)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The post form opens in the right column of the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('an overlapping post gets the heads-up and lands as Standby', async ({ page }) => {
    await page.goto('/p/job-a/deliveries');
    const cards = page.getByTestId('delivery-day-cards');
    await expect(cards.getByTestId('delivery-card')).toHaveCount(2);

    await page.getByTestId('deliveries-post').click();
    const form = page.getByTestId('right-column').getByTestId('delivery-form');
    await form.getByTestId('delivery-company').selectOption('Sample Steel Co');
    await form.getByTestId('delivery-time').fill('07:30');
    await form.getByTestId('delivery-description').fill('Sample beams');
    await expect(form.getByTestId('delivery-heads-up')).toContainText('Heads up — Sample Concrete Co already has a delivery 7:00–8:00 AM');
    await expect(form.getByTestId('delivery-submit')).toHaveText('Post as Standby');
    await form.getByTestId('delivery-submit').click();

    const receipt = page.getByTestId('right-column').getByTestId('delivery-receipt');
    await expect(receipt.getByTestId('delivery-receipt-number')).toHaveText('#4');
    await expect(receipt).toContainText('Standby');
    const posted = cards.getByTestId('delivery-card').filter({ hasText: 'Sample Steel Co' });
    await expect(posted).toContainText('Standby');
    await expect(cards.getByTestId('delivery-card')).toHaveCount(3);
  });

  test('TV mode opens full screen with a live clock', async ({ page }) => {
    await page.goto('/p/job-a/deliveries');
    await page.getByTestId('deliveries-tv').click();
    const tv = page.getByTestId('delivery-tv');
    await expect(tv).toBeVisible();
    await expect(tv.getByTestId('delivery-tv-clock')).toHaveText(/^\d{1,2}:\d{2}:\d{2} (AM|PM)$/);
    await expect(tv.getByTestId('delivery-card')).toHaveCount(2);
    await tv.getByRole('button', { name: 'Exit' }).click();
    await expect(tv).toBeHidden();
  });

  test('the delivery link opens the public board and posts with a typed name', async ({ page }) => {
    await page.goto('/p/job-a/deliveries?view=link');
    await page.getByRole('button', { name: 'Make link' }).click();
    const url = await page.getByTestId('delivery-link-url').textContent();
    expect(url).toMatch(/\/d\/job-a\?t=[A-Za-z0-9_-]{43}$/);

    await page.goto(url ?? '');
    await expect(page.getByRole('heading', { name: 'Deliveries' })).toBeVisible();
    await page.getByTestId('deliveries-post').click();
    await page.getByTestId('delivery-name').fill('Sample Driver');
    await page.getByTestId('delivery-company').selectOption({ label: 'Other' });
    await page.getByTestId('delivery-company-other').fill('Sample Crane Rental');
    await page.getByTestId('delivery-time').fill('10:00');
    await page.getByTestId('delivery-description').fill('Sample crane mats');
    await page.getByTestId('delivery-submit').click();

    const receipt = page.getByTestId('delivery-receipt');
    await expect(receipt).toContainText('Sample Crane Rental');
    await expect(receipt).toContainText('Sample Driver');
    await expect(page.getByTestId('delivery-day-cards')).toContainText('Sample Crane Rental');
  });

  test('Time TBD sits under Time and takes the duration away', async ({ page }) => {
    await page.goto('/p/job-a/deliveries/new');
    const form = page.getByTestId('right-column').getByTestId('delivery-form');
    await expect(form.getByTestId('delivery-duration')).toBeVisible();
    await form.getByTestId('delivery-tbd').check();
    await expect(form.getByTestId('delivery-time')).toBeDisabled();
    await expect(form.getByTestId('delivery-duration')).toHaveCount(0);
    // One title: the right column's (the form has no heading of its own on a desktop).
    await expect(page.getByTestId('right-column').locator('h1')).toHaveCount(0);
  });

  test('a post for another day shows that day on the board', async ({ page }) => {
    const day = fromToday(10);
    await page.goto('/p/job-a/deliveries');
    await page.getByTestId('deliveries-post').click();
    const form = page.getByTestId('right-column').getByTestId('delivery-form');
    await form.getByTestId('delivery-company').selectOption('Sample Lumber');
    await form.getByTestId('delivery-date').fill(day);
    await form.getByTestId('delivery-time').fill('13:00');
    await form.getByTestId('delivery-description').fill('Sample studs');
    await form.getByTestId('delivery-submit').click();

    await expect(page.getByTestId('right-column').getByTestId('delivery-receipt')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`day=${day}`));
    await expect(page.getByTestId(`delivery-day-${day}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('delivery-day-cards')).toContainText('Sample studs');
  });

  test('the three weeks hold still when a day is tapped; only the arrows move them', async ({ page }) => {
    await page.goto('/p/job-a/deliveries');
    const first = await firstDay(page);
    const inWeek3 = page.locator('[data-testid^="delivery-day-2"]').nth(16);
    const tapped = await inWeek3.getAttribute('data-testid');
    await inWeek3.click();
    await expect(page.getByTestId(tapped ?? '')).toHaveAttribute('aria-pressed', 'true');
    expect(await firstDay(page)).toBe(first);

    await page.getByRole('button', { name: 'Later week' }).click();
    await expect.poll(() => firstDay(page)).not.toBe(first);
    await page.getByRole('button', { name: 'Earlier week' }).click();
    await expect.poll(() => firstDay(page)).toBe(first);
  });

  test('a ticket comes off a delivery with Undo; a ticket deleted in Files leaves no tile', async ({ page }) => {
    await page.goto(`/p/job-a/deliveries/mock-delivery-3?day=${fromToday(2)}`);
    const right = page.getByTestId('right-column');
    await expect(right.getByTestId('delivery-receipt-number')).toHaveText('#3');
    // Its only ticket was deleted in Files: nothing to show, nothing to fail.
    await expect(right.getByTestId('delivery-file')).toHaveCount(0);

    await right.locator('input[type="file"]').last().setInputFiles({
      name: 'Sample ticket.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 sample ticket'),
    });
    const tile = right.getByTestId('delivery-file');
    await expect(tile).toHaveCount(1);
    await expect(tile).toContainText('Sample ticket.pdf');

    await tile.getByTestId('delivery-file-remove').click();
    await expect(right.getByTestId('delivery-file')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(right.getByTestId('delivery-file')).toHaveCount(1);

    await right.getByRole('button', { name: 'History' }).click();
    await expect(right).toContainText('Photo removed');
  });

  test('a tile opens the viewer over the delivery\'s photo and ticket; Delete there comes off with Undo', async ({ page }) => {
    await page.goto(`/p/job-a/deliveries/mock-delivery-3?day=${fromToday(2)}`);
    const right = page.getByTestId('right-column');
    await expect(right.getByTestId('delivery-receipt-number')).toHaveText('#3');
    await right.locator('input[type="file"]').last().setInputFiles([
      { name: 'Sample unload photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(60).fill(0)]) },
      { name: 'Sample steel ticket.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample ticket') },
    ]);
    await expect(right.getByTestId('delivery-file')).toHaveCount(2);

    await right.getByRole('button', { name: 'View Sample unload photo.jpg' }).click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByRole('img', { name: 'Sample unload photo.jpg' })).toBeVisible();
    await expect(viewer.getByTestId('viewer-count')).toContainText('of 2');
    // The other file is the ticket: its first page.
    const toTicket = viewer.getByTestId((await viewer.getByTestId('viewer-count').textContent()) === '1 of 2' ? 'viewer-next' : 'viewer-prev');
    await toTicket.click();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample steel ticket.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');

    // Delete takes the ticket off the delivery; the viewer stays on the photo; Undo puts it back.
    await viewer.getByTestId('viewer-delete').click();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample unload photo.jpg');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await expect(right.getByTestId('delivery-file')).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(right.getByTestId('delivery-file')).toHaveCount(2);
  });

  test("Delete knows the signed-in person's name; Undo brings the delivery back", async ({ page }) => {
    await page.goto('/p/job-a/deliveries/mock-delivery-1');
    const right = page.getByTestId('right-column');
    await right.getByRole('button', { name: 'Delete' }).click();
    await expect(right.getByTestId('delivery-delete-name')).toHaveValue('Sample PM');
    await right.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await expect(right).toContainText('Deleted by Sample PM');
    await page.getByRole('button', { name: 'Undo' }).first().click();
    await expect(right).not.toContainText('Deleted by');
  });

  test('a month row opens its delivery, and the board behind shows its day', async ({ page }) => {
    // The month that holds #3, picked on its first day.
    await page.goto(`/p/job-a/deliveries?view=month&day=${fromToday(2).slice(0, 7)}-01`);
    await page.getByTestId('delivery-month-row').filter({ hasText: 'Sample Steel Co' }).first().click();
    const right = page.getByTestId('right-column');
    await expect(right.getByTestId('delivery-receipt-number')).toHaveText('#3');
    await expect(page).toHaveURL(new RegExp(`/deliveries/mock-delivery-3\\?.*day=${fromToday(2)}`));
  });

  test('a new post is on the Calendar at once (no stale cache)', async ({ page }) => {
    await page.goto('/p/job-a/calendar');
    await page.getByTestId('cal-today').click();
    const detail = page.getByTestId('cal-day-detail');
    await expect(detail.getByTestId('cal-kind-deliveries')).toContainText('Sample Concrete Co');
    await expect(detail).not.toContainText('Sample cache check');

    await page.getByTestId('rail-more').click();
    await page.getByTestId('rail-more-deliveries').click();
    await page.getByTestId('deliveries-post').click();
    const form = page.getByTestId('right-column').getByTestId('delivery-form');
    await form.getByTestId('delivery-company').selectOption('Sample Steel Co');
    await form.getByTestId('delivery-time').fill('11:00');
    await form.getByTestId('delivery-description').fill('Sample cache check');
    await form.getByTestId('delivery-submit').click();
    await expect(page.getByTestId('right-column').getByTestId('delivery-receipt')).toBeVisible();

    await page.getByTestId('rail-calendar').click();
    await page.getByTestId('cal-today').click();
    await expect(page.getByTestId('cal-day-detail').getByTestId('cal-kind-deliveries')).toContainText('Sample Steel Co: Sample cache check');
  });

  test('the poster carries the QR code', async ({ page }) => {
    await page.goto('/p/job-a/deliveries?view=link');
    await page.getByRole('button', { name: 'Make link' }).click();
    await page.getByRole('button', { name: 'Poster' }).click();
    const poster = page.getByTestId('delivery-poster');
    await expect(poster.getByTestId('qr-code')).toBeVisible();
    await expect(poster).toContainText('Scan with your phone camera');
  });

  test('the public post form works where the browser blocks storage', async ({ page }) => {
    await page.goto('/p/job-a/deliveries?view=link');
    await page.getByRole('button', { name: 'Make link' }).click();
    const url = await page.getByTestId('delivery-link-url').textContent();
    // Safari "block all cookies": the remembered name and company throw on read and write.
    await page.addInitScript(() => {
      type Get = (this: Storage, key: string) => string | null;
      type Set = (this: Storage, key: string, value: string) => void;
      const get = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem')?.value as Get;
      const set = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')?.value as Set;
      Storage.prototype.getItem = function (this: Storage, key: string) {
        if (key.startsWith('app:delivery')) throw new DOMException('blocked', 'SecurityError');
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (key.startsWith('app:delivery')) throw new DOMException('blocked', 'SecurityError');
        set.call(this, key, value);
      };
    });
    await page.goto(url ?? '');
    await page.getByTestId('deliveries-post').click();
    await expect(page.getByTestId('delivery-name')).toHaveValue('');
    await page.getByTestId('delivery-name').fill('Sample Driver');
    await page.getByTestId('delivery-company').selectOption('Sample Lumber');
    await page.getByTestId('delivery-time').fill('14:00');
    await page.getByTestId('delivery-description').fill('Sample plywood');
    await page.getByTestId('delivery-submit').click();
    await expect(page.getByTestId('delivery-receipt')).toContainText('Sample Driver');
  });
});
