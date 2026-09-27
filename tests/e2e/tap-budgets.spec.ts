// CI tap budgets (SPEC §7.9) that Phase 0 can test. They run only against the mock data layer (VITE_E2E_MOCK=true).
//
// Contract with the frontend's e2e mock layer:
//   - localStorage 'e2e-mock-user' set before load  -> the app starts signed in as that mock user (absent -> signed out);
//   - the mock user belongs to at least two jobs, and each job has at least one visible file;
//   - test ids: job-picker (button), job-picker-option-<n> (menu items, n from 0), rail-files, rail-board,
//     file-row-download (one per file row), main-area (with data-tool = the current tool);
//   - 'bidder' as the mock user -> a bidder on job-a: /p/job-a/bids shows the bidder page with addendum 1 issued and
//     not yet acknowledged; test ids addendum-ack-<number> (the button) and addendum-acked-<number> (after).
//   - 'newcomer' as the mock user -> no company and no jobs: "/" shows the setup flow. Test ids setup-company-name,
//     setup-company-next, setup-job-name, setup-job-create, and job-picker-new (the picker's "New job").
// Opening a tool before a measured task is setup, not part of the budget. Every click on the page is counted.
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

interface ClickWindow {
  __tapCount: number;
}

/** Signs in as a mock user and counts every click on the page (capture phase, so stopped events still count). */
async function installTapCounter(page: Page, user: string): Promise<void> {
  await page.addInitScript((who: string) => {
    window.localStorage.setItem('e2e-mock-user', who);
    (window as unknown as ClickWindow).__tapCount = 0;
    document.addEventListener('click', () => {
      (window as unknown as ClickWindow).__tapCount += 1;
    }, true);
  }, user);
}

async function resetTaps(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as ClickWindow).__tapCount = 0;
  });
}
function taps(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as ClickWindow).__tapCount);
}
/** Clicks through Playwright and counts it on the test's own counter (cross-checked against the page's count). */
async function tap(locator: Locator, counter: { n: number }): Promise<void> {
  await locator.click();
  counter.n += 1;
}

test.describe('tap budgets (SPEC §7.9)', () => {
  test.skip(!MOCK, 'Tap budgets run only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run them.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Rail budgets are desktop; the phone shell gets its own budgets.');
    await installTapCounter(page, 'pm');
    await page.goto('/');
    await expect(page.getByTestId('main-area')).toBeVisible();
  });

  test('download any visible file = 1 click', async ({ page }) => {
    await page.getByTestId('rail-files').click(); // setup: open the tool
    const row = page.getByTestId('file-row-download').first();
    await expect(row).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    const download = page.waitForEvent('download', { timeout: 10_000 });
    await tap(row, counter);
    const file = await download;

    expect(counter.n).toBe(1);
    expect(await taps(page)).toBe(1);
    const name = file.suggestedFilename();
    expect(name.length, 'download keeps a real filename').toBeGreaterThan(0);
    expect(name, 'download keeps the original filename, not a storage id').not.toMatch(/^[0-9a-f-]{36}$/i);
  });

  for (const tool of ['files', 'board'] as const) {
    test(`switch job, same tool = 2 clicks (${tool})`, async ({ page }) => {
      await page.getByTestId(`rail-${tool}`).click(); // setup: open the tool
      const main = page.getByTestId('main-area');
      const picker = page.getByTestId('job-picker');
      await expect(main).toHaveAttribute('data-tool', /.+/);
      const toolBefore = await main.getAttribute('data-tool');
      const jobBefore = (await picker.innerText()).trim();
      await resetTaps(page);

      const counter = { n: 0 };
      await tap(picker, counter);
      const options = page.getByTestId(/^job-picker-option-\d+$/);
      await expect(options.first()).toBeVisible();
      const texts = (await options.allInnerTexts()).map((t) => t.trim());
      const target = texts.findIndex((t) => t !== '' && !jobBefore.includes(t) && !t.includes(jobBefore));
      expect(target, `a job other than "${jobBefore}" is offered (${texts.join(' | ')})`).toBeGreaterThanOrEqual(0);
      await tap(options.nth(target), counter);

      await expect(picker).not.toHaveText(jobBefore);
      await expect(main).toHaveAttribute('data-tool', toolBefore ?? '');
      expect(counter.n).toBe(2);
      expect(await taps(page)).toBe(2);
    });
  }
});

test.describe('tap budgets, bidder (SPEC §7.9)', () => {
  test.skip(!MOCK, 'Tap budgets run only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run them.');

  test.beforeEach(async ({ page }) => {
    await installTapCounter(page, 'bidder');
  });

  test('acknowledge an addendum (bidder) = 1 click from the bid page', async ({ page }) => {
    await page.goto('/p/job-a/bids'); // setup: the bid page itself
    const ack = page.getByTestId('addendum-ack-1');
    await expect(ack).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    await tap(ack, counter);

    await expect(page.getByTestId('addendum-acked-1')).toBeVisible();
    await expect(ack).toHaveCount(0);
    expect(counter.n).toBe(1);
    expect(await taps(page)).toBe(1);
  });
});

test.describe('setup: first company and job, new job (SPEC §5.1)', () => {
  test.skip(!MOCK, 'Tap budgets run only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run them.');

  test('first run: company, then job, lands in the job = 2 clicks (typing is not counted)', async ({ page }) => {
    await installTapCounter(page, 'newcomer');
    await page.goto('/');
    const companyName = page.getByTestId('setup-company-name');
    await expect(companyName).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    await companyName.fill('Sample Start Co');
    await tap(page.getByTestId('setup-company-next'), counter);
    const jobName = page.getByTestId('setup-job-name');
    await expect(jobName).toBeVisible();
    await jobName.fill('Sample First Job');
    await tap(page.getByTestId('setup-job-create'), counter);

    await expect(page.getByTestId('main-area')).toBeVisible();
    await expect(page.getByTestId('job-picker')).toHaveText('Sample First Job');
    expect(counter.n).toBeLessThanOrEqual(3);
    expect(await taps(page)).toBe(counter.n);
  });

  test('new job from the job picker = 3 clicks', async ({ page }) => {
    await installTapCounter(page, 'pm');
    await page.goto('/');
    const picker = page.getByTestId('job-picker');
    await expect(page.getByTestId('main-area')).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    await tap(picker, counter);
    await tap(page.getByTestId('job-picker-new'), counter);
    const jobName = page.getByTestId('setup-job-name');
    await expect(jobName).toBeVisible();
    await jobName.fill('Sample Added Job');
    await tap(page.getByTestId('setup-job-create'), counter);

    await expect(picker).toHaveText('Sample Added Job');
    await expect(page.getByTestId('main-area')).toBeVisible();
    expect(counter.n).toBe(3);
    expect(await taps(page)).toBe(3);
  });
});
