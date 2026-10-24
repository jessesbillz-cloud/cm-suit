// The look (Jesse, Oct 23: "make everything look more presentable, like it was purposely designed"): pictures of the
// fire marshal's screens on a 1440x900 desktop and an iPhone 14, kept by CI as the look-screenshots artifact so the
// design can be checked without running the app. Each picture waits for its screen to finish loading; nothing else
// is asserted here (the flows have their own tests). Runs against the e2e mock (job-s, the Sample Science Building):
// 'pm' is the job's designated person, 'ahj' the fire marshal, 'inspector' sets up a room's card, 'sub' requests.
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const JOB = 'job-s';
const SUBMITTAL = '211313_01.0_Sample Sprinkler Shop Drawings_NET.pdf';

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. */
async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  try {
    await page.goto(path);
  } catch (e) {
    // The first page of a test can reload itself once (a new build taking over) while this navigation starts.
    if (!String(e).includes('interrupted by another navigation')) throw e;
    await page.waitForLoadState();
    await page.goto(path);
  }
}

/** Waits for the screen to settle (no loading placeholder left, fonts in), then saves its picture. */
async function shot(page: Page, name: string): Promise<void> {
  await expect(page.locator('[role=status][aria-live=polite]')).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: `test-results/look/${test.info().project.name}-${name}.png` });
}

test.describe('the look of the fire marshal screens', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('pictures of each screen', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // The designated person's start page: the three big boxes; a submittal sent so the fire marshal has one to review.
    await openAs(page, 'pm', `/p/${JOB}/board`);
    await expect(page.getByTestId('ofs-desk-boxes')).toBeVisible();
    await expect(page.getByTestId('ofs-desk-submittal')).toBeEnabled();
    await page
      .getByTestId('ofs-desk-submittal-input')
      .setInputFiles({ name: SUBMITTAL, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${SUBMITTAL}\n%%EOF\n`) });
    // The upload has landed: it waits on OFS.
    const waiting = page.locator('[data-testid="ofs-group"][data-group="waiting"]');
    await waiting.getByTestId('ofs-group-head').first().click();
    await expect(page.locator('[data-testid="ofs-group"][data-group="waiting/submittals"]').getByTestId('ofs-group-count').first()).toHaveText('1');
    await shot(page, '01-start-page');

    // The fire marshal: home, For review, one item open with Approve / Not approved.
    await openAs(page, 'ahj', '/all/board');
    await expect(page.getByTestId('main-area')).toBeVisible();
    await shot(page, '02-home');
    await openAs(page, 'ahj', `/p/${JOB}/review`);
    await expect(page.getByTestId('ofs-review')).toBeVisible();
    await shot(page, '03-for-review');
    await page.getByTestId('ofs-row').filter({ hasText: SUBMITTAL }).click();
    await expect(page.getByTestId('ofs-approve')).toBeVisible();
    await shot(page, '04-review-item');

    // The inspection cards: the rooms, a room, its card set up, a wall's own page (the 3-D wall).
    await openAs(page, 'pm', `/p/${JOB}/revs`);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'revs');
    await shot(page, '05-rooms');
    await openAs(page, 'pm', `/p/${JOB}/revs/room-mock-room-205`);
    await expect(page.getByTestId('rev-room-page')).toBeVisible();
    await shot(page, '06-room');
    await openAs(page, 'inspector', `/p/${JOB}/revs/room-mock-room-205`);
    await page.getByTestId('rev-room-card').click();
    await expect(page.getByTestId('rev-card-setup')).toBeVisible();
    await shot(page, '07-set-up-card');
    await openAs(page, 'pm', `/p/${JOB}/revs/mock-rev-area-6`);
    await expect(page.getByTestId('rev-wall-page')).toBeVisible();
    await shot(page, '08-wall');

    // The OFS request, and the fire marshal's result step.
    await openAs(page, 'sub', `/p/${JOB}/inspections/new?areas=mock-rev-area-4&items=mock-rev-item-3-1`);
    await expect(page.getByTestId('rev-picker')).toBeVisible();
    await shot(page, '09-ofs-request');
    await openAs(page, 'ahj', `/p/${JOB}/inspections/mock-ir-job-s-3`);
    await expect(page.getByTestId('ir-pane').getByTestId('ir-inspector')).toBeVisible();
    await shot(page, '10-result-step');

    // Files (a CSU job: no CCDs).
    await openAs(page, 'pm', `/p/${JOB}/files`);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
    await shot(page, '11-files');

    // The board's lines, colored by what happened under their day headings (Sample Job B has today's and yesterday's).
    await openAs(page, 'pm', '/p/job-b/board');
    await expect(page.locator('[data-testid="board-line"][data-tone="not_approved"]').first()).toBeVisible();
    await page.getByTestId('board-day').first().scrollIntoViewIfNeeded();
    await shot(page, '12-board');
  });
});
