// Speed after security (Jesse, Oct 1: "the less that we have to load the better"): a first screen downloads the frame
// and its own tool only; a tool's code starts loading when the pointer is on its rail item (or a finger on its tab, or
// More opens), so the click doesn't wait. Runs against the e2e mock. Where the whole app is one file (a one-file
// preview bundle) nothing loads later, so the "loads on hover" checks are skipped there.
// Contract with the mock (as rail.spec.ts): 'pm' on Sample Job A has RFIs, Inspections, Files under the job's name and
// Dailies, Deliveries, Corrections, People under More. Test ids: rail-<tool>, phone-tab-more, phone-more-<tool>,
// main-area (data-tool).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** Every script the page asks for, from now on. */
function scripts(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') urls.push(new URL(r.url()).pathname);
  });
  return urls;
}

/** True when the app loads as separate modules or chunks (Vite dev, a real build), not one file. */
function split(urls: readonly string[]): boolean {
  return urls.filter((u) => /\.(tsx?|jsx?)$/.test(u)).length > 1;
}

const loaded = (urls: readonly string[], name: string) => urls.some((u) => u.includes(name));

test.describe('load less', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('the board loads without the other tools\' code; hovering a tool starts its code before the click', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    const urls = scripts(page);
    await page.goto('/p/job-a/board');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'board');
    await page.waitForLoadState('networkidle');
    for (const other of ['BidsTool', 'RfisTool', 'InspectionsTool', 'SettingsTool', 'PermitsTool']) {
      expect(loaded(urls, other), `${other} loaded with the board`).toBe(false);
    }
    test.skip(!split(urls), 'The whole app is one file here.');

    const code = page.waitForRequest((r) => r.url().includes('InspectionsTool'));
    await page.getByTestId('rail-inspections').hover();
    await code;
    await page.getByTestId('rail-inspections').click();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'inspections');
  });

  test('phone: opening More starts the code of the tools in it', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Uses the phone bar.');
    const urls = scripts(page);
    await page.goto('/p/job-a/board');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'board');
    await page.waitForLoadState('networkidle');
    expect(loaded(urls, 'CorrectionsTool'), 'Corrections loaded with the board').toBe(false);
    test.skip(!split(urls), 'The whole app is one file here.');

    const code = page.waitForRequest((r) => r.url().includes('CorrectionsTool'));
    await page.getByTestId('phone-tab-more').click();
    await code;
    await page.getByTestId('phone-more-corrections').click();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'corrections');
  });
});
