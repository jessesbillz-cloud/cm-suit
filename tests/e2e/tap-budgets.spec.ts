// CI tap budgets (SPEC §7.9) that Phase 0 can test. They run only against the mock data layer (VITE_E2E_MOCK=true).
//
// Contract with the frontend's e2e mock layer:
//   - localStorage 'e2e-mock-user' set before load  -> the app starts signed in as that mock user (absent -> signed out);
//   - the mock user belongs to at least two jobs, and each job has at least one visible file;
//   - 'pm' has no tools of their own on the job, so the rail is only the job's: the PM's recommendation without the
//     Board, then Files (0040, 0051, 0058). Files there; the job's Board and Dailies under More (rail-more, then
//     rail-more-<tool>);
//   - test ids: home (the mark: All my jobs), job-picker (button), job-picker-option-<n> (jobs, n from 0), rail-files, rail-more,
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

/** Setup (not counted): opens a tool from the rail, or from More when it is not on the rail. */
async function openTool(page: Page, tool: string): Promise<void> {
  const onRail = page.getByTestId(`rail-${tool}`);
  if ((await onRail.count()) > 0) {
    await onRail.click();
    return;
  }
  await page.getByTestId('rail-more').click();
  await page.getByTestId(`rail-more-${tool}`).click();
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
    // Setup: "/" opens All my jobs (Sep 28), whose rail has no job tools, so open the first job. Not counted.
    await page.getByTestId('job-picker').click();
    await page.getByTestId('job-picker-option-0').click();
    await expect(page).toHaveURL(/\/p\/[^/]+\/board/);
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

  // SPEC §7.9 "Download any file you can see: 1": a plan sheet in Revs, through the gate that shows it.
  test('download the plan sheet on screen = 1 click', async ({ page }) => {
    await page.goto('/p/job-s/revs?view=plan'); // setup: the plan itself
    const download = page.getByTestId('plan-sheet').getByTestId('plan-download');
    await expect(download).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    const saved = page.waitForEvent('download', { timeout: 10_000 });
    await tap(download, counter);
    const file = await saved;

    expect(counter.n).toBe(1);
    expect(await taps(page)).toBe(1);
    expect(file.suggestedFilename()).toBe('Sample A-101 Floor Plan.pdf');
  });

  // The job's Board and Dailies sit under More for the PM: switching jobs keeps them all the same.
  for (const tool of ['files', 'board', 'dailies'] as const) {
    test(`switch job, same tool = 2 clicks (${tool})`, async ({ page }) => {
      await openTool(page, tool); // setup: open the tool
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

  // Home from inside a job is the mark, top-left (Jesse, Oct 5): one click, from any tool.
  test('home from a job = 1 click', async ({ page }) => {
    await openTool(page, 'files'); // setup: a job's tool
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
    await resetTaps(page);

    const counter = { n: 0 };
    await tap(page.getByTestId('home'), counter);

    await expect(page).toHaveURL(/\/all\/board$/);
    expect(counter.n).toBe(1);
    expect(await taps(page)).toBe(1);
  });
});

test.describe("tap budgets, today's daily (SPEC §7.9)", () => {
  test.skip(!MOCK, 'Tap budgets run only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run them.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await installTapCounter(page, 'pm');
  });

  // From the report screen: Submit, then the signature confirm when the server asks for one (the mock session is fresh,
  // so it signs straight away). Typing the report is not counted.
  test("submit today's daily = at most 3 clicks + signature confirm", async ({ page }) => {
    await page.goto('/p/job-a/dailies'); // setup: the report screen
    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    await editor.getByTestId('note-general').fill('Sample note for the day.');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    await tap(editor.getByTestId('daily-submit'), counter);
    await expect(page.getByTestId('daily-submitted')).toBeVisible();
    expect(counter.n).toBeLessThanOrEqual(3);
    expect(await taps(page)).toBe(counter.n);
  });
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
    await expect(page.getByTestId('job-picker')).toContainText('Sample First Job');
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

    await expect(picker).toContainText('Sample Added Job');
    await expect(page.getByTestId('main-area')).toBeVisible();
    expect(counter.n).toBe(3);
    expect(await taps(page)).toBe(3);
  });
});

// Jesse, Oct 10 (the fire marshal's demo): a whole room, two items, from the room in Revs. Before: open a wall, its
// items, Request, then each other wall of the room, the notice box, the question, Request, I confirm (12 for a room of
// four walls). Now: room, Request inspection, 2 items, No, Request, I confirm = 7, on the desktop and the phone.
test.describe('tap budgets, OFS request from a room', () => {
  test.skip(!MOCK, 'Tap budgets run only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run them.');

  test('whole room, 2 items = 7 taps', async ({ page }) => {
    await installTapCounter(page, 'sub');
    await page.goto('/p/job-s/revs'); // setup: Revs, the rooms of Level 01
    const room = page.getByTestId('rev-rooms').getByTestId('rev-room-mock-room-110');
    await expect(room).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    await tap(room, counter);
    await tap(page.getByTestId('rev-room-request'), counter);
    await expect(page.getByTestId('rev-pick-room-mock-room-110')).toHaveAttribute('aria-pressed', 'true');
    await tap(page.getByTestId('rev-item-mock-rev-item-3-1'), counter);
    await tap(page.getByTestId('rev-item-mock-rev-item-3-2'), counter);
    await tap(page.getByTestId('ir-special-required-no'), counter);
    await tap(page.getByTestId('ir-submit'), counter);
    await tap(page.getByTestId('ir-attest-confirm'), counter);

    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
    expect(counter.n).toBe(7);
    expect(await taps(page)).toBe(7);
  });
});
