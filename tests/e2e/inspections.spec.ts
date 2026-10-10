// Inspection scheduling (SPEC §13.2) against the e2e mock. The mock 'pm' holds every capability, so it is both the
// requester and the inspector here: it sends a request and gets a receipt with the IR number, confirms it from the day
// view (tap budget §7.9: 2; it takes 1) and records a result. PDFs and email are server-only and not mocked.
// The mock seeds a month of requests on the sample jobs (the calendar's), keeping 9:00-10:00 today free on job-a, so
// the new request's number is whatever the database (mock) gives next.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

interface TapWindow {
  __taps: number;
}

/** Opens a page; the test's first page can reload itself once (a new build taking over) while this navigation starts. */
async function open(page: Page, path: string): Promise<void> {
  try {
    await page.goto(path);
  } catch (e) {
    if (!String(e).includes('interrupted by another navigation')) throw e;
    await page.waitForLoadState();
    await page.goto(path);
  }
}

test.describe('inspections (SPEC §13.2)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
      (window as unknown as TapWindow).__taps = 0;
      document.addEventListener('click', () => {
        (window as unknown as TapWindow).__taps += 1;
      }, true);
    });
  });

  test('request -> receipt; the inspector confirms and records a result', async ({ page }) => {
    // The sample job is under construction, so Inspections is already on its rail.
    // Requester: the form is prefilled; that day is open; the receipt carries the number the database gave.
    await page.goto('/p/job-a/inspections?view=month');
    await expect(page.getByTestId('rail-inspections')).toBeVisible();
    await page.getByTestId('ir-new').click();
    await expect(page.getByTestId('ir-company')).toHaveValue('Sample Concrete Co');
    await page.getByTestId('ir-time').selectOption('09:00');
    await page.getByTestId('ir-items').fill('Sample footing rebar at grid A');
    // The day's bookings are listed; 9:00 overlaps none of them.
    const conflicts = page.getByTestId('ir-conflicts');
    await expect(conflicts.getByRole('listitem').first().or(conflicts.getByText('Open day.'))).toBeVisible();
    await expect(conflicts).not.toContainText('Overlaps');
    await expect(page.getByTestId('ir-submit')).toBeDisabled();
    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
    const n = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');
    await expect(page.getByTestId('ir-receipt')).toContainText('Waiting on the inspector.');
    // On the month: today opens under its week with the new request.
    await page.getByTestId('ir-today').click();
    await expect(page.getByTestId('ir-open').getByTestId('ir-entry').filter({ hasText: new RegExp(`IR ${n} ·`) })).toBeVisible();

    // Inspector: the day's queue; Confirm is one tap.
    await page.goto('/p/job-a/inspections?view=day');
    const row = page.getByTestId(`ir-queue-${n}`);
    await expect(row).toContainText('Pending');
    await page.evaluate(() => {
      (window as unknown as TapWindow).__taps = 0;
    });
    await page.getByTestId(`ir-confirm-${n}`).click();
    await expect(row).toContainText('Confirmed');
    expect(await page.evaluate(() => (window as unknown as TapWindow).__taps)).toBeLessThanOrEqual(2);

    // Open it: record Approved, then the one-tap "No issues" note.
    await row.click();
    const pane = page.getByTestId('ir-pane');
    await expect(pane.getByTestId('ir-tracker')).toContainText('Confirmed');
    await pane.getByTestId('ir-result-approved').click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('Approved');
    await pane.getByTestId('ir-no-issues').click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('No issues');
    await expect(row).toContainText('Approved');
    await expect(pane.getByTestId('ir-generate')).toBeVisible();
  });

  test('attendance only sets the attendance: a pending request stays pending until Confirm (Oct 5)', async ({ page }) => {
    await page.goto('/p/job-a/inspections?view=week');
    await page.getByTestId('ir-new').click();
    await page.getByTestId('ir-time').selectOption('09:00');
    await page.getByTestId('ir-items').fill('Sample shear wall nailing at grid C');
    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
    const n = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');

    await page.goto(`/p/job-a/inspections/mock-ir-${n}`);
    const pane = page.getByTestId('ir-pane');
    // Pending: Confirm and Attendance; no result to tap until it is confirmed.
    await expect(pane.getByTestId('ir-confirm')).toBeVisible();
    await expect(pane.getByTestId('ir-result-approved')).toHaveCount(0);
    await pane.getByTestId('ir-attendance-be_present').click();
    await expect(pane.getByTestId('ir-attendance-be_present')).toHaveAttribute('aria-checked', 'true');
    await expect(pane.getByTestId('ir-tracker')).not.toContainText('Confirmed');
    await expect(pane.getByTestId('ir-confirm')).toBeVisible();
    await expect(pane.getByTestId('ir-result-approved')).toHaveCount(0);
    // The day's queue beside it: still pending (yellow), with the attendance call.
    const row = page.getByTestId(`ir-queue-${n}`);
    await expect(row).toContainText('Pending');
    await expect(row).toContainText('Be present with the IOR');

    // Confirm is its own tap; then the result opens.
    await pane.getByTestId('ir-confirm').click();
    await expect(row).toContainText('Confirmed');
    await expect(pane.getByTestId('ir-tracker')).toContainText('Confirmed');
    await expect(pane.getByTestId('ir-attendance-be_present')).toHaveAttribute('aria-checked', 'true');
    await expect(pane.getByTestId('ir-result-approved')).toBeVisible();
  });

  test('attendance in MDR\'s words; Send results offers the link requester and a typed address (0075)', async ({ page }) => {
    // A visitor asks through the link with an email (a later init script wins over the pm one).
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'anon');
    });
    await open(page, '/r/job-a?t=sample-request-token-sample-request-token-1');
    await page.getByTestId('public-time').selectOption('11:00');
    await page.getByTestId('public-items').fill('Sample hold-downs at grid 2');
    await page.getByTestId('public-name').fill('Sample Foreman');
    await page.getByTestId('public-company').fill('Sample Framing Co');
    await page.getByTestId('public-email').fill('foreman@example.test');
    await page.getByTestId('public-ack').check();
    await page.getByTestId('public-submit').click();
    await expect(page.getByTestId('public-ir-number')).toHaveText(/^IR \d+$/);
    const n = ((await page.getByTestId('public-ir-number').textContent()) ?? '').replace('IR ', '');

    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
    await open(page, `/p/job-a/inspections/mock-ir-${n}`);
    const pane = page.getByTestId('ir-pane');
    await pane.getByTestId('ir-confirm').click();
    // Each step waits for the last save (the next one carries its version).
    await expect(pane.getByTestId('ir-tracker')).toContainText('Confirmed');
    await expect(pane.getByTestId('ir-attendance-be_present')).toHaveText('Be present with the IOR');
    await expect(pane.getByTestId('ir-attendance-alone')).toHaveText("I've got this alone");
    await pane.getByTestId('ir-attendance-be_present').click();
    await expect(pane.getByTestId('ir-attendance-be_present')).toHaveAttribute('aria-checked', 'true');
    await pane.getByTestId('ir-result-approved').click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('Approved');
    await pane.getByTestId('ir-generate').click();
    await expect(pane.getByTestId('ir-view-ir')).toBeVisible();

    // Send results: the link requester is there and checked; a typed address joins the list checked. Nothing is sent.
    await pane.getByTestId('ir-send-open').click();
    const picker = pane.getByTestId('ir-send-picker');
    await expect(picker).toContainText('Sample Foreman · foreman@example.test');
    await expect(picker.getByTestId('ir-send-requester')).toBeChecked();
    await expect(pane.getByTestId('ir-send-add')).toBeDisabled();
    await picker.getByTestId('ir-send-email').fill('Owner.Rep@Example.test');
    await picker.getByTestId('ir-send-add').click();
    await expect(picker.getByTestId('ir-send-typed')).toBeChecked();
    await expect(picker).toContainText('owner.rep@example.test');
    await expect(picker.getByTestId('ir-send-go')).toBeEnabled();
  });
});
