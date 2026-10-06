// "/" opens All my jobs (Jesse, Sep 28): the board of every job, a rail of only the tools that work across jobs, and
// Bids there is the pipeline of every job being bid; a row opens that job's Bids. Runs only against the e2e mock.
// Contract with the mock: 'pm' manages bids on the Sample pipeline jobs (data/mock/pipelineJobs): job-p5 is bidding
// with its bid time 2 days past, job-p2 due tomorrow, job-p1 in 3 days (3 open questions), job-p4 in 12 days,
// job-p3 a prospect with no date, job-p6 awarded, job-p7 lost.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function signIn(page: Page, who = 'pm'): Promise<void> {
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
}

test.describe('All my jobs and the bids pipeline', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('"/" lands on All my jobs, board; only Board, Calendar and Bids are offered', async ({ page, isMobile }) => {
    await signIn(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/all\/board$/);
    await expect(page.getByTestId('job-picker')).toContainText('All my jobs');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'board');

    const tools = isMobile ? page.getByTestId(/^phone-tab-(?!more)/) : page.getByTestId(/^rail-/);
    await expect(tools).toHaveCount(isMobile ? 3 : 4);
    for (const t of ['board', 'calendar', 'bids']) {
      await expect(page.getByTestId(isMobile ? `phone-tab-${t}` : `rail-${t}`)).toBeVisible();
    }
    if (!isMobile) await expect(page.getByTestId('rail-settings')).toBeVisible();
    await expect(page.getByTestId(isMobile ? 'phone-tab-files' : 'rail-files')).toHaveCount(0);
  });

  test('Bids opens the pipeline: open bids first, bid due soonest; a row opens that job\'s Bids', async ({ page, isMobile }) => {
    await signIn(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/all\/board$/);
    await page.getByTestId(isMobile ? 'phone-tab-bids' : 'rail-bids').click();

    await expect(page).toHaveURL(/\/all\/bids$/);
    await expect(page.getByTestId('job-picker')).toContainText('All my jobs');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'bids');
    await expect(page.getByTestId('pipeline-stage-prospect')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pipeline-stage-bidding')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pipeline-stage-awarded')).toHaveAttribute('aria-pressed', 'false');

    const rows = page.getByTestId(/^pipeline-row-/);
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toHaveAttribute('data-testid', 'pipeline-row-job-p5');
    await expect(rows.last()).toHaveAttribute('data-testid', 'pipeline-row-job-p3');
    await expect(page.getByTestId('pipeline-row-job-p6')).toHaveCount(0);

    // Awarded is one tap away and sorts after the open bids.
    await page.getByTestId('pipeline-stage-awarded').click();
    await expect(page.getByTestId('pipeline-stage-awarded')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(6);
    await expect(rows.last()).toHaveAttribute('data-testid', 'pipeline-row-job-p6');

    await page.getByTestId('pipeline-row-job-p1').click();
    await expect(page).toHaveURL(/\/p\/job-p1\/bids$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'bids');
    await expect(page.getByTestId('job-picker')).toContainText('Sample Library Addition');
  });

  test('a column header re-sorts the pipeline and the sort stays in the URL', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Column headers are the desktop table; the phone has a sort picker.');
    await signIn(page);
    await page.goto('/all/bids');
    const rows = page.getByTestId(/^pipeline-row-/);
    await expect(rows.first()).toHaveAttribute('data-testid', 'pipeline-row-job-p5');

    await page.getByTestId('pipeline-sort-questions').click();
    await expect(page).toHaveURL(/sort=questions\.desc/);
    await expect(rows.first()).toHaveAttribute('data-testid', 'pipeline-row-job-p1');
  });

  test('inside a job the rail is the job\'s; All my jobs from a job-only tool lands on the board', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Uses the desktop rail.');
    await signIn(page);
    await page.goto('/p/job-a/files');
    await expect(page.getByTestId('rail-files')).toBeVisible();
    // Nothing from All my jobs on a job's rail (Oct 3); the PM's rail (0040) leaves Dailies under More.
    await expect(page.getByTestId('rail-board')).toHaveCount(0);
    await expect(page.getByTestId('rail-bids')).toHaveCount(0);
    await expect(page.getByTestId('rail-dailies')).toHaveCount(0);
    await page.getByTestId('rail-more').click();
    await expect(page.getByTestId('rail-more-dailies')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/all\/board$/);
    await expect(page.getByTestId('rail-files')).toHaveCount(0);
    await expect(page.getByTestId('rail-more')).toHaveCount(0);
  });

  test('Home (the mark, top-left) goes back to All my jobs in one tap; the picker only switches jobs', async ({ page }) => {
    await signIn(page);
    await page.goto('/p/job-a/files');
    await expect(page.getByTestId('job-picker')).toContainText('Sample Job A');

    // The picker lists jobs and New job, never All my jobs (Jesse, Oct 5).
    await page.getByTestId('job-picker').click();
    await expect(page.getByRole('option', { name: /Sample Job B/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /All my jobs/ })).toHaveCount(0);
    await expect(page.getByTestId('job-picker-new')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('home')).toHaveCount(1);
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/all\/board$/);
    await expect(page.getByTestId('job-picker')).toContainText('All my jobs');
  });

  test('New prospect opens the new-job form with the stage prefilled and lands in the job\'s Bids', async ({ page }) => {
    await signIn(page);
    await page.goto('/all/bids');
    await page.getByTestId('pipeline-new').click();
    await expect(page.getByLabel('Stage')).toHaveValue('prospect');
    await page.getByTestId('setup-job-name').fill('Sample New Prospect');
    await page.getByTestId('setup-job-create').click();

    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'bids');
    await expect(page.getByTestId('job-picker')).toContainText('Sample New Prospect');
    await page.goto('/all/bids');
    await expect(page.getByTestId('bid-pipeline')).toContainText('Sample New Prospect');
  });

  test('a bidder has no pipeline', async ({ page }) => {
    await signIn(page, 'bidder');
    await page.goto('/all/bids');
    await expect(page.getByText('No bids yet.')).toBeVisible();
  });
});

test.describe('Dead ends lead home', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a page that does not exist and a tool that does not exist each offer All my jobs', async ({ page }) => {
    await signIn(page);
    for (const path of ['/no-such-page', '/p/job-a/no-such-tool']) {
      await page.goto(path);
      await expect(page.getByText('That page does not exist.')).toBeVisible();
      await page.getByRole('link', { name: 'All my jobs' }).click();
      await expect(page).toHaveURL(/\/all\/board$/);
    }
  });
});
