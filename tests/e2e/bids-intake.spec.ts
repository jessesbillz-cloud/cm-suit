// Office bid intake (SPEC §11.6) against the e2e mock data layer (VITE_E2E_MOCK=true): dropped files become
// receipts under the package their name points at, a file with no division waits for a package pick, the same
// files again create nothing, and "Read all" drafts findings and links the bidder to the directory sub by name.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

const FILES = [
  { name: '09_21050_RSA_Sample Drywall_2026_09_01.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic drywall bid') },
  { name: 'Sample Unknown bid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic unknown bid') },
];

test.describe('office bid intake (SPEC §11.6)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
      // Two-step login already done (aal2): adding and reading bids is pricing work. Only on first load.
      if (window.sessionStorage.getItem('e2e-mock-state') === null) {
        window.sessionStorage.setItem('e2e-mock-state', JSON.stringify({ mfa: { factorId: 'mock-factor-1', verified: true, level: 'aal2' } }));
      }
    });
  });

  test('files become receipts, an unknown one gets a pick, re-adding is a no-op, Read all links the sub', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=received');
    await expect(page.getByTestId('bids-add')).toBeVisible();
    const input = page.getByTestId('bids-add-input');

    await input.setInputFiles(FILES);
    // The drywall file's leading "09_" put it under 09A and recorded it as receipt 1, no questions asked.
    const drywall = page.getByTestId('received-row-09A');
    await expect(drywall).toBeVisible();
    await expect(drywall).toContainText('Sample Drywall');
    await expect(drywall).toContainText('#1');

    // The other file's name gives no division: it waits for a package pick, then is recorded.
    await page.getByTestId('intake-pick-Sample Unknown bid.pdf').selectOption({ label: '03A Sample concrete' });
    await expect(page.getByTestId('received-row-03A')).toBeVisible();
    await expect(page.getByTestId('intake-picks')).toHaveCount(0);

    // The same files again: nothing new.
    await input.setInputFiles(FILES);
    await expect(page.getByTestId(/^received-row-/)).toHaveCount(2);

    // Read all: the drywall bid's findings name "Sample Drywall", which matches the directory sub "Sample Drywall Co".
    await page.getByTestId('bids-read-all').click();
    await expect(page.getByTestId('bids-read-progress')).toHaveText('2 read');
    await expect(drywall).toContainText('Sample Drywall Co');
    await expect(drywall.getByText('Read', { exact: true })).toBeVisible();
    await expect(page.getByTestId('bids-read-all')).toBeDisabled();
  });
});
