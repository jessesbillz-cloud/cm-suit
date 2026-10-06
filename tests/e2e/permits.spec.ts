// Permits (migrations 0052, 0061) against the e2e mock. The mock follows the database's rules: 'ahj' (the fire /
// building official) makes permits (building, structure, site / utility, other) and moves them along OSFM's stages
// (Issued, then Inspected once every required inspection passed), opens reviews under a permit (the initial one,
// deferred items once it is issued, addenda, change orders) and their backchecks, and comments; 'pm' reads and answers
// comments. Sample Science Building (job-s) starts with permits 24-0001 (issued; two inspections linked, one still
// waiting; four reviews: the initial one and its backcheck, the deferred fire sprinklers back for a second backcheck,
// the deferred fire alarm and an addendum both open), 24-0002 (comments out after its backcheck), 24-0003 (in
// review), 25-0014 (submitted), 23-0410 (complete) and 25-0021 (a draft); the official is also on Sample Library Annex
// (job-t) with 25-0102 (issued, nothing to inspect) and 25-0103 (src/data/mock/permitSeeds.ts). Test ids: permit-new,
// permit-number, permit-title, permit-kind, permit-create, permit-row-<no> (data-stage), permit-row-steps and
// permit-steps (steps carry data-state done / current / todo / failed and data-kind, the stage), permit-stage,
// permit-move, permit-move-hold, permit-move-menu, permit-move-<stage>, permit-reviews, permit-review-open,
// permit-review-kind-<kind>, permit-review-<cycle> (data-open), permit-review-backcheck, permit-comment-sheet,
// permit-comment-body, permit-comment-add, permit-comment-<no>, permit-comment-answer, permit-comment-response,
// permit-comment-send, permit-comment-response-text, permit-comment-earlier, permit-filter-<f>, permit-inspection,
// permit-history, menu-backdrop, permit-revs, permit-rev-list, permit-rev-tally. The revs mock puts its one list on
// 24-0001 (src/data/mock/revSeeds.ts).
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const NUMBER = '26-0001';

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

    // The official: the agency's number, what it covers and its kind (deferred items are reviews, not kinds); it starts
    // as a draft.
    await openAs(page, 'ahj', '/p/job-s/permits');
    await page.getByTestId('permit-new').click();
    await page.getByTestId('permit-number').fill(NUMBER);
    await page.getByTestId('permit-title').fill('Sample entry canopy');
    await expect(page.getByTestId('permit-kind').locator('option')).toHaveText(['Building', 'Structure', 'Site / utility', 'Other']);
    await page.getByTestId('permit-kind').selectOption('structure');
    await page.getByTestId('permit-create').click();
    await expect(right.getByTestId('permit-stage')).toHaveText('Draft');
    await expect(right.getByTestId('permit-pane')).toContainText('Structure');
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

    // The first review is the initial one: nothing to pick. After it, before issue: an addendum or a change order
    // (deferred items wait for the issue), open at the same time.
    await right.getByTestId('permit-review-open').click();
    const review = right.getByTestId('permit-review-1');
    await expect(review).toContainText('Review 1 · Initial');
    await right.getByTestId('permit-review-open').click();
    await expect(right.getByRole('menuitem')).toHaveText(['Addendum', 'Change order']);
    await right.getByTestId('permit-review-kind-addendum').click();
    await expect(right.getByTestId('permit-review-2')).toContainText('Review 2 · Addendum');
    await expect(right.locator('[data-testid^="permit-review-"][data-open="true"]')).toHaveCount(2);
    // A comment on the initial review, numbered by the database.
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

  test('the menus close on a tap outside and on Escape', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/');
    await openAs(page, 'ahj', '/p/job-s/permits/mock-permit-s4');
    const right = page.getByTestId('right-column');
    await right.getByTestId('permit-move-menu').click();
    await expect(right.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(right.getByRole('menu')).toHaveCount(0);
    await right.getByTestId('permit-move-menu').click();
    await expect(right.getByRole('menu')).toBeVisible();
    // A tap on the log beside the column closes it (the backdrop takes the tap).
    await page.getByTestId('menu-backdrop').click({ position: { x: 300, y: 300 } });
    await expect(right.getByRole('menu')).toHaveCount(0);
    await expect(right.getByTestId('permit-stage')).toHaveText('Submitted');
  });

  test('a backcheck comes with Undo; Backcheck again opens the same one', async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'ahj', '/p/job-s/permits/mock-permit-s1');
    const reviews = page.getByTestId('permit-reviews');
    await reviews.getByTestId('permit-review-4').getByTestId('permit-review-backcheck').click();
    await expect(reviews.getByTestId('permit-review-7')).toContainText('Review 2 BC 2');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(reviews.getByTestId('permit-review-7')).toHaveCount(0);
    await expect(reviews.getByTestId('permit-review-backcheck')).toHaveCount(1);
    await reviews.getByTestId('permit-review-4').getByTestId('permit-review-backcheck').click();
    await expect(reviews.getByTestId('permit-review-7')).toContainText('Review 2 BC 2');
  });

  test("a permit shows its rev lists with the walls done; a tap opens Revs", async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'ahj', '/p/job-s/permits/mock-permit-s1');
    const revs = page.getByTestId('permit-revs');
    await expect(revs.getByTestId('permit-rev-list')).toContainText('Sample Rated Walls · PH III');
    await expect(revs.getByTestId('permit-rev-tally')).toHaveText('0 of 6 walls done');
    await revs.getByTestId('permit-rev-list').click();
    await expect(page).toHaveURL(/\/p\/job-s\/revs$/);
    // Another permit has no list: no section.
    await openAs(page, 'ahj', '/p/job-s/permits/mock-permit-s3');
    await expect(page.getByTestId('permit-pane')).toBeVisible();
    await expect(page.getByTestId('permit-revs')).toHaveCount(0);
  });

  test('History shows once the right column is at full width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/');
    await openAs(page, 'pm', '/p/job-s/permits/mock-permit-s1');
    await expect(page.getByTestId('permit-pane')).toBeVisible();
    await expect(page.getByTestId('permit-history')).toHaveCount(0);
    await page.getByTestId('right-full').click();
    await expect(page.getByTestId('permit-history')).toBeVisible();
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
    // An OFS request shows its OFS IR number with its IR number.
    await expect(page.getByTestId('permit-inspection').first()).toContainText(/IR \d+ · OFS IR #\d{4}/);
  });

  test('Inspected (IS) follows Issued; the database refuses it while a required inspection is open', async ({ page }) => {
    await page.goto('/');
    // 24-0001 is issued with an inspection still waiting for its result: the count shows by the move, and the move
    // answers with the database's words.
    await openAs(page, 'ahj', '/p/job-s/permits/mock-permit-s1');
    await expect(page.getByTestId('permit-stage')).toHaveText('Issued');
    const steps = page.getByTestId('permit-steps');
    await expect(nowStep(steps)).toHaveAttribute('data-kind', 'issued');
    await expect(steps.locator('[data-kind="inspected"]')).toHaveAttribute('data-state', 'todo');
    await expect(steps.locator('[data-kind="inspected"]')).toContainText('Inspected');
    await expect(steps.locator('[data-kind="inspections"]')).toHaveCount(0);
    await expect(page.getByTestId('permit-move')).toHaveText('Move to Inspected');
    await expect(page.getByTestId('permit-move-hold')).toHaveText(/^\d+ inspections? open$/);
    await page.getByTestId('permit-move').click();
    await expect(page.getByRole('alert').filter({ hasText: /\d+ inspections? not passed yet\./ })).toBeVisible();
    await expect(page.getByTestId('permit-stage')).toHaveText('Issued');

    // 25-0102 is issued with nothing left to inspect: Inspected, and Approved is next.
    await page.goto('/p/job-t/permits/mock-permit-t1');
    await expect(page.getByTestId('permit-move')).toHaveText('Move to Inspected');
    await expect(page.getByTestId('permit-move-hold')).toHaveCount(0);
    await page.getByTestId('permit-move').click();
    await expect(page.getByTestId('permit-stage')).toHaveText('Inspected');
    await expect(page.getByTestId('permit-pane').getByTitle('OSFM status')).toHaveText('IS');
    await expect(nowStep(page.getByTestId('permit-steps'))).toHaveAttribute('data-kind', 'inspected');
    await expect(page.getByTestId('permit-move')).toHaveText('Move to Approved');
    await expect(page.getByTestId('permit-expires')).toBeVisible();
    // Undo puts it back to Issued.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('permit-stage')).toHaveText('Issued');
  });

  test('reviews under one permit: open ones first, a backcheck on a returned review, a deferred sprinkler review', async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'ahj', '/p/job-s/permits/mock-permit-s1');
    const reviews = page.getByTestId('permit-reviews');
    const cards = reviews.locator('[data-testid^="permit-review-"][data-open]');
    // Six cycles of four reviews: the two open ones first, then the closed ones, newest first.
    await expect(cards).toHaveCount(6);
    await expect(cards.nth(0)).toContainText('Review 4 · Addendum');
    await expect(cards.nth(1)).toContainText('Review 3 · Fire alarm (deferred)');
    await expect(cards.nth(1)).toHaveAttribute('data-open', 'true');
    await expect(cards.nth(2)).toContainText('Review 2 BC 1 · Fire sprinkler (deferred)');
    await expect(cards.nth(2)).toHaveAttribute('data-open', 'false');
    await expect(cards.nth(5)).toContainText('Review 1 · Initial');

    // Backcheck only where a review's latest cycle came back to be resubmitted: the sprinklers' BC 1.
    await expect(reviews.getByTestId('permit-review-backcheck')).toHaveCount(1);
    await reviews.getByTestId('permit-review-4').getByTestId('permit-review-backcheck').click();
    await expect(reviews.getByTestId('permit-review-7')).toContainText('Review 2 BC 2 · Fire sprinkler (deferred)');
    await expect(reviews.getByTestId('permit-review-7')).toHaveAttribute('data-open', 'true');
    await expect(cards.first()).toHaveAttribute('data-testid', 'permit-review-7');
    // One open cycle per review: no second backcheck while this one is open.
    await expect(reviews.getByTestId('permit-review-backcheck')).toHaveCount(0);

    // The permit is issued: "New review" offers the deferred items too. A second sprinkler submittal is review 5.
    await reviews.getByTestId('permit-review-open').click();
    await expect(reviews.getByRole('menuitem')).toHaveText([
      'Fire alarm (deferred)', 'Fire sprinkler (deferred)', 'Radio coverage (deferred)', 'Addendum', 'Change order',
    ]);
    await reviews.getByTestId('permit-review-kind-deferred_sprinkler').click();
    await expect(reviews.getByTestId('permit-review-8')).toContainText('Review 5 · Fire sprinkler (deferred)');
    await expect(cards).toHaveCount(8);
    await expect(reviews.locator('[data-testid^="permit-review-"][data-open="true"]')).toHaveCount(4);

    // The PM reads every review and opens none.
    await openAs(page, 'pm', page.url());
    await expect(cards).toHaveCount(8);
    await expect(reviews.getByTestId('permit-review-open')).toHaveCount(0);
    await expect(reviews.getByTestId('permit-review-backcheck')).toHaveCount(0);
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
