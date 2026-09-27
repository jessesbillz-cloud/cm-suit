// Leveling and summary (SPEC §11.6) render against the mock data layer: the summary lists every package with its
// bid count and flags, a summary row lands on that package's leveling grid, and the low bid is not an amber row.
// Contract with the mock: 'pm' manages bids on job-a; bids are open; 03A has two current bids, 09A a single one.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('bid leveling (SPEC §11.6)', () => {
  test.skip(!MOCK, 'Leveling e2e runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The leveling grid is a desktop screen.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('summary shows every package with bids and flags, sum of lows only with pricing', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=summary');
    const table = page.getByTestId('bid-summary');
    await expect(table).toBeVisible();
    await expect(page.getByTestId('summary-bids-03A')).toHaveText('2');
    await expect(page.getByTestId('summary-bids-09A')).toHaveText('1');
    await expect(page.getByTestId('summary-row-09A')).toContainText('Single bid');
    await expect(page.getByTestId('summary-row-09A')).toContainText('PW not stated');
    // The mock pm has no pricing access: no money column, no total.
    await expect(page.getByTestId('summary-sum-of-lows')).toHaveCount(0);
    await expect(table).not.toContainText('$');
  });

  test('a summary row opens that package in the leveling grid; superseded rows sit below', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=summary');
    await page.getByTestId('summary-row-03A').click();
    await expect(page).toHaveURL(/view=leveling/);
    await expect(page).toHaveURL(/pkg=pkg-1/);
    await expect(page.getByTestId('leveling-pkg-03A')).toHaveAttribute('aria-current', 'true');
    const grid = page.getByTestId('leveling-grid');
    await expect(grid).toBeVisible();
    await expect(grid).toContainText('Sample Concrete Co');
    await expect(grid).toContainText('Sample Paving Co');
    await expect(grid).toContainText('+15.8% since 8/10/2026');
    await expect(grid).toContainText('Superseded');
    await expect(grid).toContainText('Backup');
    await expect(grid).toContainText('Rebar by others');

    // Picking 09A shows its one bid and the package-level flag in the header.
    await page.getByTestId('leveling-pkg-09A').click();
    await expect(page).toHaveURL(/pkg=pkg-2/);
    await expect(page.getByTestId('leveling-grid')).toContainText('Sample Drywall Co');
    await expect(page.getByTestId('main-area')).toContainText('Single bid');

    // A row opens the bid on the right with the leveling actions.
    await page.getByTestId('leveling-row-5').click();
    await expect(page.getByTestId('leveling-actions')).toBeVisible();
    await expect(page.getByTestId('right-column')).toContainText('Sample Drywall Co');
  });
});
