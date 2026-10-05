// Schedule (migration 0062) against the e2e mock: the superintendent uploads a CSV look-ahead on a job with no
// schedule, the draft opens for review (the data date prefilled with the upload day, a row without dates: Publish
// waits; the source file named with its Download), fixes the row, adds one the reader missed, publishes (Undo puts it
// back to a draft), and the look-ahead shows the activities. A reader sees the look-ahead, the 2-month
// window and an activity, and has no Upload. State lives in the tab's sessionStorage.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** The job's calendar day (the mock jobs are in Los Angeles) n days from today, yyyy-MM-dd. */
function jobDay(n: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 10/5/2026 as a super's sheet writes it. */
function us(day: string): string {
  const [y, m, d] = day.split('-');
  return `${String(Number(m))}/${String(Number(d))}/${y ?? ''}`;
}

test.describe('schedule', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('upload a CSV look-ahead, review the draft, publish, and the look-ahead shows it', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'super');
    });
    await page.goto('/p/job-b/schedule');
    await expect(page.getByText('No schedule yet.')).toBeVisible();

    const csv = [
      'Sample 3-week look-ahead,,,,',
      'Activity ID,Activity Name,Start,Finish,Responsible',
      `C100,Sample form footings,${us(jobDay(2))},${us(jobDay(4))},Sample Concrete Co`,
      `C110,Sample pour footings,${us(jobDay(6))},${us(jobDay(6))},Sample Concrete Co`,
      'C120,Sample punch walk,,,',
    ].join('\n');
    await page.getByTestId('schedule-upload-input').first().setInputFiles({ name: 'Sample look-ahead.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

    // The draft: three rows in file order, one without dates; the data date is the upload day, so only the row waits.
    await expect(page).toHaveURL(/\/p\/job-b\/schedule\/draft-/);
    await expect(page.getByTestId('schedule-draft-head')).toContainText('CSV');
    await expect(page.getByTestId('schedule-draft-counts')).toContainText('3 activities');
    await expect(page.getByTestId('schedule-draft-counts')).toContainText('1 need dates');
    await expect(page.getByTestId('schedule-publish')).toBeDisabled();
    await expect(page.getByTestId('schedule-data-date')).toHaveValue(jobDay(0));
    await expect(page.getByTestId('schedule-blocker')).toHaveText('1 activity needs a start date.');
    await expect(page.getByTestId('schedule-source-name')).toHaveText('Sample look-ahead.csv');
    await expect(page.getByTestId('schedule-source-download')).toBeVisible();

    // Fix the undated row in place: the "Need dates" button shows only it.
    await page.getByTestId('schedule-draft-filter-dates').click();
    await page.getByTestId('schedule-draft-row-3').click();
    await page.getByTestId('schedule-edit-start').fill(jobDay(9));
    await page.getByTestId('schedule-edit-save').click();
    await expect(page.getByTestId('schedule-row-edit')).toHaveCount(0);
    await expect(page.getByTestId('schedule-blocker')).toHaveCount(0);

    // A row the reader missed: Add row, then fill it in place.
    await page.getByTestId('schedule-add-row').click();
    await page.getByTestId('schedule-edit-name').fill('Sample strip forms');
    await page.getByTestId('schedule-edit-start').fill(jobDay(7));
    await page.getByTestId('schedule-edit-save').click();
    await expect(page.getByTestId('schedule-row-edit')).toHaveCount(0);
    await expect(page.getByTestId('schedule-draft-counts')).toContainText('4 activities');
    await expect(page.getByTestId('schedule-blocker')).toHaveCount(0);

    // Publish: Update 1, the look-ahead shows the rows; Undo puts it back to a draft, and it publishes again.
    await page.getByTestId('schedule-publish').click();
    await expect(page).toHaveURL(/\/p\/job-b\/schedule$/);
    await expect(page.getByTestId('schedule-status')).toContainText('Update 1');
    await expect(page.getByTestId('schedule-lookahead')).toContainText('Sample form footings');
    await expect(page.getByTestId('schedule-lookahead')).toContainText('Sample pour footings');
    await expect(page.getByTestId('schedule-lookahead')).toContainText('Sample punch walk');
    await expect(page.getByTestId('schedule-lookahead')).toContainText('Sample strip forms');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page).toHaveURL(/\/p\/job-b\/schedule\/draft-/);
    await expect(page.getByTestId('schedule-publish')).toBeEnabled();
    await page.getByTestId('schedule-publish').click();
    await expect(page.getByTestId('schedule-status')).toContainText('Update 1');

    await page.getByTestId('schedule-view-updates').click();
    await expect(page.getByTestId('schedule-version-1')).toContainText('Current');
  });

  test('a PDF look-ahead shows beside its rows; the published update views it full screen', async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'super');
    });
    await page.goto('/p/job-b/schedule');
    await page.getByTestId('schedule-upload-input').first().setInputFiles({
      name: 'Sample printed look-ahead.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic look-ahead'),
    });
    await expect(page).toHaveURL(/\/p\/job-b\/schedule\/draft-/);
    await expect(page.getByTestId('schedule-source-name')).toHaveText('Sample printed look-ahead.pdf');
    const viewer = page.getByTestId('file-viewer');
    if (isMobile) {
      // A phone has no room beside the rows: View opens it full screen.
      await page.getByTestId('schedule-source-view').click();
    } else {
      // Beside the rows, page by page; Full screen from there.
      const beside = page.getByTestId('schedule-draft').getByTestId('file-preview');
      await expect(beside.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
      await beside.getByTestId('file-preview-full').click();
    }
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample printed look-ahead.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    // The undated row gets a start, then Publish; the update keeps the original with View and Download.
    await page.getByTestId('schedule-draft-filter-dates').click();
    await page.getByTestId('schedule-draft-row-3').click();
    await page.getByTestId('schedule-edit-start').fill(jobDay(9));
    await page.getByTestId('schedule-edit-save').click();
    await page.getByTestId('schedule-publish').click();
    await expect(page.getByTestId('schedule-status')).toContainText('Update 1');
    await page.goto('/p/job-b/schedule?view=updates');
    await page.getByTestId('schedule-version-1').click();
    await expect(page.getByTestId('schedule-version-file')).toHaveText('Sample printed look-ahead.pdf');
    await expect(page.getByTestId('schedule-version-download')).toBeVisible();
    await page.getByTestId('schedule-version-view').click();
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('a reader: the look-ahead, two months out, an activity; no Upload', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'inspector');
    });
    await page.goto('/p/job-a/schedule');
    await expect(page.getByTestId('schedule-status')).toContainText('Update 3');
    await expect(page.getByTestId('schedule-upload')).toHaveCount(0);
    await expect(page.getByTestId('schedule-underway')).toContainText('Exterior framing, north side');
    await expect(page.getByTestId('schedule-today')).toBeVisible();
    await expect(page.getByTestId('schedule-lookahead')).not.toContainText('Toilet accessories install');

    await page.getByTestId('schedule-range-2m').click();
    await expect(page).toHaveURL(/range=2m/);
    await expect(page.getByTestId('schedule-lookahead')).toContainText('Toilet accessories install (owner-furnished)');

    await page.getByTestId('schedule-row-A2150').click();
    await expect(page.getByTestId('schedule-activity-name')).toHaveText(
      'Install fire-rated head-of-wall joint system at the corridor partitions, Level 2 north wing, grids 4 through 9',
    );
    await expect(page.getByTestId('schedule-activity')).toContainText('Sample Drywall Co');

    await page.goto('/p/job-a/schedule?view=updates');
    await expect(page.getByTestId('schedule-version-3')).toContainText('Current');
    await expect(page.getByTestId('schedule-version-2')).toContainText('Superseded');
    await expect(page.getByTestId('schedule-version-draft')).toHaveCount(0);
  });

  test('an update is due when the data date is over 35 days back', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
    await page.goto('/p/job-s/schedule');
    await expect(page.getByTestId('schedule-status')).toContainText('Update due');
  });
});
