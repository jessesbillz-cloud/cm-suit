// The official stamps the plans and the permit is issued (migration 0053) against the e2e mock. The mock follows the
// database's rules: 'ahj' (the official) stamps a permit in review (issue) or issued, inspected or approved (revision,
// 0061), one PDF at a time, then records the set; 'pm' reads the set and downloads it, and never stamps. Sample Science
// Building (job-s) has plan PDFs in Plans; 24-0003 is in review with no set; 24-0001 is issued with two sets (the first
// superseded); on Sample Library Annex (job-t) 25-0102 is issued with one (src/data/mock/permitStamp.ts, permitJobs.ts). Test ids: permit-approved, permit-stamp, stamp-flow, stamp-source,
// stamp-search, stamp-sign, stamp-state (data-state), stamp-result, stamp-done, permit-approved-current,
// permit-approved-old, permit-approved-file, permit-approved-download, permit-stage.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. The first page of a
 *  test can reload itself once (a new build taking over) while this navigation starts: open it again (rfis.spec). */
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

test.describe('permit stamp', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('the official picks two PDFs, signs, and the permit is issued with its approved set', async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'ahj', '/p/job-s/permits/mock-permit-s3');
    await expect(page.getByTestId('permit-stage')).toHaveText('In review');
    const approved = page.getByTestId('permit-approved');
    await expect(approved.getByTestId('permit-stamp')).toHaveText('Stamp and issue');
    await approved.getByTestId('permit-stamp').click();

    // Pick two: one from the list, one found by searching.
    const flow = page.getByTestId('stamp-flow');
    await flow.getByTestId('stamp-source').filter({ hasText: 'Sample A-101 Floor Plan.pdf' }).click();
    await flow.getByTestId('stamp-search').fill('fp-1');
    await expect(flow.getByTestId('stamp-source').filter({ hasText: 'Sample A-201' })).toHaveCount(0);
    await flow.getByTestId('stamp-source').filter({ hasText: 'Sample FP-1 Fire Sprinkler Plan.pdf' }).click();
    await expect(flow.getByTestId('stamp-sign')).toHaveText('Stamp and issue (2)');

    // Sign: each file stamps, then the set is recorded at once. No Undo: a signed record.
    await flow.getByTestId('stamp-sign').click();
    await expect(flow.getByTestId('stamp-result')).toContainText('Permit issued. Approved set: 2 files.');
    await expect(flow.getByTestId('stamp-result')).toContainText('Sample FP-1 Fire Sprinkler Plan - Approved 24-0003.pdf');
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await flow.getByTestId('stamp-done').click();

    await expect(page.getByTestId('permit-stage')).toHaveText('Issued');
    const current = page.getByTestId('permit-approved-current');
    await expect(current.getByTestId('permit-approved-file')).toHaveCount(2);
    await expect(current).toContainText('Sample A-101 Floor Plan - Approved 24-0003.pdf');
    await expect(current).toContainText('Sample FP-1 Fire Sprinkler Plan - Approved 24-0003.pdf');
    await expect(page.getByTestId('permit-expires')).toBeVisible();
    // Once issued, stamping again is a revision.
    await expect(page.getByTestId('permit-stamp')).toHaveText('Stamp revision');
  });

  test('once the permit is Inspected, stamping is still a revision', async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'ahj', '/p/job-t/permits/mock-permit-t1');
    await expect(page.getByTestId('permit-stamp')).toHaveText('Stamp revision');
    await page.getByTestId('permit-move').click();
    await expect(page.getByTestId('permit-stage')).toHaveText('Inspected');
    await expect(page.getByTestId('permit-stamp')).toHaveText('Stamp revision');
  });

  test('a PM sees the current set and the superseded one, downloads a sheet, and never stamps', async ({ page }, testInfo) => {
    await page.goto('/');
    await openAs(page, 'pm', '/p/job-s/permits/mock-permit-s1');
    const approved = page.getByTestId('permit-approved');
    await expect(approved.getByTestId('permit-approved-current').getByTestId('permit-approved-file')).toHaveCount(2);
    await expect(approved.getByTestId('permit-approved-old')).toContainText('Superseded');
    await expect(page.getByTestId('permit-stamp')).toHaveCount(0);
    test.skip(testInfo.project.name !== 'desktop', 'A phone saves through the share sheet, not a download.');
    const download = page.waitForEvent('download');
    await approved.getByTestId('permit-approved-current').getByTestId('permit-approved-download').first().click();
    expect((await download).suggestedFilename()).toBe('Sample A-101 Floor Plan - Approved 24-0001.pdf');
  });
});
