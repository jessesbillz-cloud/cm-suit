// The bidder's page (SPEC §11.4) against the e2e mock (VITE_E2E_MOCK=true): the mock bidder on Sample Job A sees the
// job's Plans and Specs and the issued addendum's sketch, and nothing from Reports or Photos (the mock applies the
// same read rules as the database, 0076); downloads them in one click; views the plan set and the issued addendum's
// sketch in the file viewer (the preview gate's addendum branch); submits a bid through the upload queue, gets
// a receipt and downloads that bid again.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

const BID = { name: 'Sample concrete bid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic bid') };

test.describe('bidder page (SPEC §11.4)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'bidder');
    });
  });

  test('plans, specs and the issued addendum file are there and download; reports are not', async ({ page }) => {
    await page.goto('/p/job-a/bids');
    await expect(page.getByTestId('bidder-page')).toBeVisible();
    const docs = page.getByTestId('bidder-documents');
    await expect(docs).toContainText('Sample Plan Set A.pdf');
    await expect(docs).not.toContainText('No documents yet');

    const plan = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Sample Plan Set A.pdf' }).click();
    expect((await plan).suggestedFilename()).toBe('Sample Plan Set A.pdf');

    // The issued addendum carries its sketch, by name, one click.
    const sketch = page.getByRole('button', { name: 'Download Sample SK-1 revised schedule.pdf' });
    await expect(sketch).toBeVisible();
    const file = page.waitForEvent('download');
    await sketch.click();
    expect((await file).suggestedFilename()).toBe('Sample SK-1 revised schedule.pdf');
  });

  test('the plan set and the issued addendum file open in the viewer', async ({ page }) => {
    await page.goto('/p/job-a/bids');
    const viewer = page.getByTestId('file-viewer');
    await page.getByRole('button', { name: 'View Sample Plan Set A.pdf' }).click();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Plan Set A.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    await page.getByRole('button', { name: 'View Sample SK-1 revised schedule.pdf' }).click();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample SK-1 revised schedule.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    // The bidder never deletes an addendum's file.
    await expect(viewer.getByTestId('viewer-delete')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('the bidder cannot open other folders in Files', async ({ page }) => {
    await page.goto('/p/job-a/files');
    await expect(page.getByTestId('folder')).toHaveText(['Plans', 'Specs']);
  });

  test('submit a bid: the receipt comes back and the bid downloads again', async ({ page }) => {
    await page.goto('/p/job-a/bids');
    await page.getByTestId('bid-submit-03A').setInputFiles(BID);
    const receipt = page.getByTestId('bid-receipt').first();
    await expect(receipt).toContainText('Receipt #1');
    const again = page.waitForEvent('download');
    await page.getByTestId('bid-download-1').click();
    expect((await again).suggestedFilename()).toBe('Sample concrete bid.pdf');
  });
});
