// The home by role (Jesse, Oct 12: "I would never use Bids; that would be a CM tool, a PE on the management side"):
// All my jobs shows each person only what their role on some job works, decided by capabilities. Runs only against the
// e2e mock.
// Contract with the mock: 'inspector' holds no bids.* (mock/bids NO_BIDS), decides inspections and writes no RFIs;
// 'pm' runs bids on the Sample pipeline jobs (5 open: job-p5 due first, its bid time past) and has RFIs 003 and 004
// on job A waiting on the architect. Test ids: home-inspections, home-inspections-count, needs-you, needs-you-count,
// needs-you-rfi, home-rfis, home-rfis-count, home-bids, home-bids-count, home-bid, rail-<tool>, phone-tab-<tool>.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function signIn(page: Page, who: string): Promise<void> {
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
}

test.describe('the home by role', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('an inspector: Inspections today and Needs you lead; no Bids anywhere, no RFIs waiting', async ({ page, isMobile }) => {
    await signIn(page, 'inspector');
    await page.goto('/');
    await expect(page).toHaveURL(/\/all\/board$/);
    await expect(page.getByTestId('home-inspections')).toBeVisible();
    await expect(page.getByTestId('home-inspections-count')).toHaveText(/^\d+$/);
    await expect(page.getByTestId('needs-you')).toBeVisible();
    await expect(page.getByTestId('needs-you-count')).toHaveText(/^\d+$/);
    // Inspections today comes first.
    const first = await page.getByTestId('home-inspections').boundingBox();
    const needs = await page.getByTestId('needs-you').boundingBox();
    expect(first?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(needs?.y ?? Number.NEGATIVE_INFINITY);

    await expect(page.getByTestId(isMobile ? 'phone-tab-calendar' : 'rail-calendar')).toBeVisible();
    await expect(page.getByTestId(isMobile ? 'phone-tab-bids' : 'rail-bids')).toHaveCount(0);
    if (isMobile) {
      await page.getByTestId('phone-tab-more').click();
      await expect(page.getByTestId('phone-more-bids')).toHaveCount(0);
    }
    await expect(page.getByTestId('home-bids')).toHaveCount(0);
    await expect(page.getByTestId('home-rfis')).toHaveCount(0);
  });

  test('a PM: open bids and RFIs waiting in their own boxes; a bid opens its job\'s Bids', async ({ page, isMobile }) => {
    await signIn(page, 'pm');
    await page.goto('/all/board');
    await expect(page.getByTestId(isMobile ? 'phone-tab-bids' : 'rail-bids')).toBeVisible();

    const rfis = page.getByTestId('home-rfis');
    await expect(rfis.getByTestId('needs-you-rfi').filter({ hasText: 'RFI 003' })).toBeVisible();
    await expect(rfis.getByTestId('needs-you-rfi').filter({ hasText: 'RFI 004' })).toBeVisible();
    // Not twice: Needs you holds the tasks only.
    await expect(page.getByTestId('needs-you').getByTestId('needs-you-rfi')).toHaveCount(0);

    const bids = page.getByTestId('home-bids');
    await expect(page.getByTestId('home-bids-count')).toHaveText('5');
    await expect(bids.getByTestId('home-bid')).toHaveCount(5);
    await bids.getByTestId('home-bid').first().click();
    await expect(page).toHaveURL(/\/p\/job-p5\/bids$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'bids');
  });
});
