// Permits (migration 0052) against the e2e mock. The mock follows the database's rules: 'ahj' (the fire / building
// official) makes permits and moves them along OSFM's stages, opens reviews and comments; 'pm' reads and answers
// comments. Sample Science Building (job-s) starts with permits 24-0001 (in inspections, two inspections linked),
// 24-0002 (comments out after two review cycles), 24-0003 (in review), 25-0014 (submitted), 23-0410 (complete) and
// 25-0021 (a draft); the official is also on Sample Library Annex (job-t) with 25-0102 and 25-0103
// (src/data/mock/permitSeeds.ts). Test ids: permit-new, permit-number, permit-title, permit-create, permit-row-<no>
// (data-stage), permit-row-steps and permit-steps (steps carry data-state done / current / todo / failed and data-kind,
// the stage), permit-stage, permit-move, permit-move-menu, permit-move-<stage>, permit-review-open,
// permit-review-<cycle>, permit-comment-sheet, permit-comment-body, permit-comment-add, permit-comment-<no>,
// permit-comment-answer, permit-comment-response, permit-comment-send, permit-comment-response-text,
// permit-comment-earlier, permit-filter-<f>,
// permit-inspection, permit-history.
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const NUMBER = '26-0001';

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. */
async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto(path);
}

/** The step of a tracker that has it now. */
function nowStep(scope: Locator): Locator {
  return scope.locator('[data-state="current"]');
}

test.describe('permits', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('the official makes a permit, moves it to review, opens a review and comments; the PM answers', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame; the phone gets its own test.');
    await page.goto('/');
    const right = page.getByTestId('right-column');
    const row = page.getByTestId(`permit-row-${NUMBER}`);

    // The official: the agency's number and what it covers; it starts as a draft.
    await openAs(page, 'ahj', '/p/job-s/permits');
    await page.getByTestId('permit-new').click();
    await page.getByTestId('permit-number').fill(NUMBER);
    await page.getByTestId('permit-title').fill('Sample canopy fire sprinkler (deferred)');
    await page.getByTestId('permit-create').click();
    await expect(right.getByTestId('permit-stage')).toHaveText('Draft');
    await expect(row).toHaveAttribute('data-stage', 'draft');
    await expect(nowStep(row.getByTestId('permit-row-steps'))).toHaveAttribute('data-kind', 'draft');

    // Through intake to review, one tap each; nothing to confirm.
    for (const [stage, label] of [
      ['submitted', 'Submitted'],
      ['accepted', 'Accepted'],
      ['in_review', 'In review'],
    ] as const) {
      await right.getByTestId('permit-move').click();
      await expect(right.getByTestId('permit-stage')).toHaveText(label);
      await expect(row).toHaveAttribute('data-stage', stage);
    }
    await expect(nowStep(row.getByTestId('permit-row-steps'))).toHaveAttribute('data-kind', 'in_review');
    await expect(row.getByTestId('permit-row-steps').locator('[data-state="done"]')).toHaveCount(3);
    await expect(nowStep(right.getByTestId('permit-steps'))).toHaveAttribute('data-kind', 'in_review');

    // A review cycle and a comment, numbered by the database.
    await right.getByTestId('permit-review-open').click();
    const review = right.getByTestId('permit-review-1');
    await expect(review).toContainText('Review 1 · Initial');
    await review.getByTestId('permit-comment-sheet').fill('FP-2');
    await review.getByTestId('permit-comment-body').fill('Sample comment: show the canopy sprinkler heads.');
    await review.getByTestId('permit-comment-add').click();
    const comment = review.getByTestId('permit-comment-1');
    await expect(comment).toContainText('Sample comment: show the canopy sprinkler heads.');
    await expect(comment).toHaveAttribute('data-status', 'open');
    const permitUrl = page.url();

    // The PM: reads it and answers the comment, which shows right under it.
    await openAs(page, 'pm', permitUrl);
    await expect(right.getByTestId('permit-move')).toHaveCount(0);
    await expect(right.getByTestId('permit-review-open')).toHaveCount(0);
    const pmComment = right.getByTestId('permit-review-1').getByTestId('permit-comment-1');
    await pmComment.getByTestId('permit-comment-answer').click();
    await pmComment.getByTestId('permit-comment-response').fill('Sample answer: heads added on FP-2.');
    await pmComment.getByTestId('permit-comment-send').click();
    await expect(pmComment.getByTestId('permit-comment-response-text')).toContainText('heads added on FP-2');
    await expect(pmComment.getByTestId('permit-comment-earlier')).toHaveCount(0);
    // A new answer never wipes the one before: it stays under it.
    await pmComment.getByTestId('permit-comment-answer').click();
    await pmComment.getByTestId('permit-comment-response').fill('Sample answer: heads added on FP-2 and FP-3.');
    await pmComment.getByTestId('permit-comment-send').click();
    await expect(pmComment.getByTestId('permit-comment-response-text')).toContainText('FP-2 and FP-3');
    await expect(pmComment.getByTestId('permit-comment-earlier')).toContainText('Sample answer: heads added on FP-2.');
    await expect(row).toHaveAttribute('data-stage', 'in_review');
  });

  test('a move comes with Undo, not "are you sure"; reject sits in the menu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/');
    await openAs(page, 'ahj', '/p/job-s/permits');
    const right = page.getByTestId('right-column');
    const row = page.getByTestId('permit-row-25-0014');
    await row.click();
    await expect(right.getByTestId('permit-stage')).toHaveText('Submitted');
    await right.getByTestId('permit-move-menu').click();
    await right.getByTestId('permit-move-rejected').click();
    await expect(right.getByTestId('permit-stage')).toHaveText('Rejected');
    await expect(row.getByTestId('permit-row-steps').locator('[data-state="failed"]')).toHaveAttribute('data-kind', 'rejected');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(right.getByTestId('permit-stage')).toHaveText('Submitted');
    await expect(row).toHaveAttribute('data-stage', 'submitted');
  });

  test("the official's caseload: every permit across their jobs, by number, each naming its job", async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'ahj', '/all/permits?view=all');
    const rows = page.getByTestId(/^permit-row-\d/);
    await expect(rows).toHaveCount(8);
    await expect(rows.first()).toHaveAttribute('data-testid', 'permit-row-23-0410');
    await expect(page.getByTestId('permit-row-25-0102')).toContainText('Sample Library Annex');
    await page.getByTestId('permit-filter-issued').click();
    await expect(rows).toHaveCount(2);
    await page.getByTestId('permit-row-24-0001').click();
    await expect(page.getByTestId('permit-inspection')).toHaveCount(2);
  });

  test('phone: two tight lines a permit, the stage named on the first; a permit opens full screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone layout.');
    await page.goto('/');
    await openAs(page, 'pm', '/p/job-s/permits');
    const row = page.getByTestId('permit-row-24-0002');
    await expect(row.getByTestId('permit-row-stage')).toContainText('Comments out');
    await expect(nowStep(row.getByTestId('permit-row-steps'))).toHaveAttribute('data-kind', 'comments_out');
    await row.click();
    await expect(page.getByTestId('permit-pane')).toBeVisible();
    await expect(page.getByTestId('permit-history')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  });

  test('people who may not read permits see none', async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'sub', '/p/job-s/permits');
    await expect(page.getByText("You can't see permits on this job.")).toBeVisible();
    await expect(page.getByTestId(/^permit-row-\d/)).toHaveCount(0);
  });
});
