// The OFS request flow (0091; Jesse, Oct 5) against the e2e mock (job-s, Sample Science Building): the sub confirms the
// job's attestation in one small dialog (Back sends nothing), the GC checks Ready (Undo, then again), the GC's admin
// picks who sends OFS requests on People, everyone sees who it is on the request, the inspector checks Ready and the
// SI report (Undo in order), the sender types the OFS number and sends, and the fire marshal reads the whole chain
// with names. Mock users: 'sub' asks, 'pm' is the GC (and its admin), 'inspector' checks, 'ahj' is the fire marshal.
// Test ids: ir-attest, ir-attest-text, ir-attest-confirm, ir-attest-back, ofs-checks, ofs-<attest|gc|ready|si|sent>
// (data-done) with -check and -undo, ofs-number, ofs-duty, duty-ofs-company, duty-ofs-person.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const WORDING = 'To the best of my knowledge, the work listed is complete and ready for inspection.';

async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  try {
    await page.goto(path);
  } catch (e) {
    if (!String(e).includes('interrupted by another navigation')) throw e;
    await page.waitForLoadState();
    await page.goto(path);
  }
}

test.describe('OFS request flow', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'sub');
    });
  });

  test('attest, check in order, pick who sends, type the OFS number, send; the fire marshal reads the chain', async ({ page }) => {
    test.setTimeout(60_000);
    // The sub: Request opens the attestation; Back sends nothing; I confirm sends it.
    await page.goto('/p/job-s/inspections/new?areas=mock-rev-area-4&items=mock-rev-item-3-1');
    await expect(page.getByTestId('rev-picker')).toBeVisible();
    await page.getByTestId('ir-special-required-yes').click();
    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-attest-text')).toHaveText(WORDING);
    await page.getByTestId('ir-attest-back').click();
    await expect(page.getByTestId('ir-attest')).toHaveCount(0);
    await expect(page.getByTestId('ir-receipt')).toHaveCount(0);
    await page.getByTestId('ir-submit').click();
    await page.getByTestId('ir-attest-confirm').click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
    const n = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');
    const url = `/p/job-s/inspections/mock-ir-${n}`;

    // On the request: his attestation with the words; no box for him to tap, nothing to send.
    await page.goto(url);
    const checks = page.getByTestId('ofs-checks');
    await expect(checks.getByTestId('ofs-attest')).toContainText('Sample Sub');
    await expect(checks.getByTestId('ofs-attest')).toContainText(WORDING);
    await expect(checks.getByTestId('ofs-gc')).toHaveAttribute('data-done', 'false');
    await expect(checks.getByTestId('ofs-gc-check')).toHaveCount(0);
    await expect(checks.getByTestId('ofs-number')).toHaveCount(0);
    await expect(page.getByTestId('ir-send-ofs')).toHaveCount(0);

    // The GC: Ready, Undo, Ready. Return stays; Approve is the check now.
    await openAs(page, 'pm', url);
    await expect(page.getByTestId('ir-gc').getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await checks.getByTestId('ofs-gc-check').click();
    await expect(checks.getByTestId('ofs-gc')).toHaveAttribute('data-done', 'true');
    await expect(checks.getByTestId('ofs-gc')).toContainText('Sample PM');
    await checks.getByTestId('ofs-gc-undo').click();
    await expect(checks.getByTestId('ofs-gc')).toHaveAttribute('data-done', 'false');
    await checks.getByTestId('ofs-gc-check').click();
    await expect(checks.getByTestId('ofs-gc')).toHaveAttribute('data-done', 'true');

    // The GC's admin picks who sends OFS requests (the GC is the company until the owner picks another).
    await openAs(page, 'pm', '/p/job-s/people');
    await expect(page.getByTestId('duty-ofs-company')).toHaveValue('Sample Builders');
    await page.getByTestId('duty-ofs-person').selectOption('mock-user-pm');
    await expect(page.getByTestId('duty-ofs-person')).toHaveValue('mock-user-pm');

    // Everyone sees who it is; the sub can't change it.
    await openAs(page, 'sub', url);
    await expect(checks.getByTestId('ofs-duty')).toHaveText('OFS requests: Sample PM');
    await openAs(page, 'sub', '/p/job-s/people');
    await expect(page.getByTestId('duty-ofs-person-name')).toHaveText('Sample PM');
    await expect(page.getByTestId('duty-ofs-person')).toHaveCount(0);

    // The inspector: Ready, then the SI report; Undo in order.
    await openAs(page, 'inspector', url);
    await checks.getByTestId('ofs-ready-check').click();
    await expect(checks.getByTestId('ofs-ready')).toContainText('Sample Inspector');
    await checks.getByTestId('ofs-si-check').click();
    await expect(checks.getByTestId('ofs-si')).toHaveAttribute('data-done', 'true');
    await expect(checks.getByTestId('ofs-ready-undo')).toHaveCount(0);
    await checks.getByTestId('ofs-si-undo').click();
    await expect(checks.getByTestId('ofs-si')).toHaveAttribute('data-done', 'false');
    await checks.getByTestId('ofs-si-check').click();
    await expect(checks.getByTestId('ofs-si')).toHaveAttribute('data-done', 'true');

    // The duty holder types the OFS number (prefilled by the database) and sends it.
    await openAs(page, 'pm', url);
    await expect(checks.getByTestId('ofs-number')).toHaveValue(/^\d+$/);
    await checks.getByTestId('ofs-number').fill('41');
    await checks.getByTestId('ofs-number').press('Enter');
    await expect(page.getByText(`IR ${n} · OFS IR #0041`, { exact: true })).toBeVisible();
    await page.getByTestId('ir-send-ofs').click();
    await expect(page.getByTestId('ir-with-ofs')).toBeVisible();

    // The fire marshal: the whole chain, with names; nothing to type.
    await openAs(page, 'ahj', url);
    await expect(checks.getByTestId('ofs-attest')).toContainText('Sample Sub');
    await expect(checks.getByTestId('ofs-gc')).toContainText('Sample PM');
    await expect(checks.getByTestId('ofs-ready')).toContainText('Sample Inspector');
    await expect(checks.getByTestId('ofs-si')).toContainText('Sample Inspector');
    await expect(checks.getByTestId('ofs-sent')).toContainText('Sample PM');
    await expect(checks.getByTestId('ofs-number')).toHaveCount(0);
  });
});
