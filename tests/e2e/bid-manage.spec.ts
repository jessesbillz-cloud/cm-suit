// The estimator's bid flows against the e2e mock (VITE_E2E_MOCK=true), Oct 4 audit: Make addendum starts from the
// reworded question, never the asker's words; an answered question shows its answer and is answered again on purpose;
// a dismissed one is reopened; a stray draft addendum is discarded and brought back; an issued addendum lists who has
// and hasn't acknowledged it; Invite from a package has that package picked and offers the directory's subs for it; a
// package and a sub are removed with Undo.
// Contract with the mock: 'pm' manages bids on Sample Job A (packages 03A pkg-1, 09A pkg-2; question 1 open; addendum 1
// issued; invites from Sample Reviewer and Sample Sub on 03A, neither acknowledged).
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

test.describe('bids: questions, addenda, invites, removals', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The list and the right column side by side is the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('Make addendum starts from the reworded question', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=questions');
    await page.getByTestId('question-row-1').click();
    // Managers see who asked and for which package.
    await expect(page.getByTestId('right-column')).toContainText('03A Sample concrete');
    await page.getByTestId('question-published').fill('Is the slab 4 or 6 inches thick?');
    await page.getByTestId('question-answer-text').fill('6 inches, see S-201.');
    await page.getByTestId('question-make-addendum').click();
    await expect(page).toHaveURL(/view=addenda/);
    const body = page.getByTestId('addendum-body');
    await expect(body).toHaveValue('Is the slab 4 or 6 inches thick?\n\n6 inches, see S-201.');
    await expect(body).not.toHaveValue(/Sample Design here/);
  });

  test('answer, see the answer, answer again; dismiss and reopen', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=questions');
    await page.getByTestId('question-row-1').click();
    await page.getByTestId('question-published').fill('Slab thickness?');
    await page.getByTestId('question-answer-text').fill('6 inches.');
    await page.getByTestId('question-answer-send').click();
    await expect(page.getByTestId('question-answer')).toContainText('6 inches.');
    await expect(page.getByTestId('question-form')).toHaveCount(0);

    await page.getByTestId('question-answer-again').click();
    await expect(page.getByTestId('question-answer-text')).toHaveValue('6 inches.');
    await page.getByTestId('question-answer-text').fill('6 inches, #4 at 12.');
    await page.getByTestId('question-answer-send').click();
    await expect(page.getByTestId('question-answer')).toContainText('#4 at 12');

    // An answered one can't be dismissed from here; a fresh open one can. Use a reload to start from question 1 open.
    await page.evaluate(() => {
      window.sessionStorage.removeItem('e2e-mock-questions');
    });
    await page.reload();
    await page.getByTestId('question-dismiss').click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    // Closing the toast without Undo commits the dismiss.
    await page.getByRole('status').getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('question-reopen')).toBeVisible();
    await page.getByTestId('question-reopen').click();
    await expect(page.getByTestId('question-form')).toBeVisible();
  });

  test('a stray draft addendum is discarded, then brought back with Undo', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=addenda');
    await page.getByTestId('addendum-new').click();
    await expect(page.getByTestId('addendum-title')).toHaveValue('New addendum');
    await expect(page.getByTestId('addendum-row-2')).toBeVisible();
    await page.getByTestId('addendum-discard').click();
    await expect(page.getByTestId('addendum-row-2')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('addendum-row-2')).toBeVisible();
  });

  test('an issued addendum lists who has not acknowledged it', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=addenda');
    await page.getByTestId('addendum-row-1').click();
    const acks = page.getByTestId('addendum-acks');
    await expect(acks).toContainText('Acknowledged 0 of 2');
    await expect(acks.getByTestId('ack-missing')).toHaveCount(2);
    await expect(acks).toContainText('Sample Design');
  });

  test("an issued addendum's file opens in the viewer", async ({ page }) => {
    await page.goto('/p/job-a/bids?view=addenda');
    await page.getByTestId('addendum-row-1').click();
    await page.getByTestId('right-column').getByTestId('file-line-view').click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample SK-1 revised schedule.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('Invite from a package has it picked and offers its subs from the directory', async ({ page }) => {
    await page.goto('/p/job-a/bids?view=coverage');
    await page.getByTestId('coverage-row-03A').click();
    await expect(page.getByTestId('package-invite')).toHaveCount(2);
    await page.getByTestId('package-invite-more').click();
    await expect(page.getByTestId('invite-package-03A')).toBeChecked();
    await expect(page.getByTestId('invite-package-09A')).not.toBeChecked();
    const directory = page.getByTestId('invite-directory');
    await expect(directory).toContainText('Sample Concrete Co');
    await directory.getByRole('button', { name: 'Add Sample Concrete Co' }).click();
    await expect(page.getByTestId('invite-emails')).toHaveValue('Sample Concrete Co <one@example.test>');
    await page.getByTestId('invite-send').click();
    await expect(page.getByTestId('invite-results')).toContainText('one@example.test');
  });

  test('a package and a sub are removed with Undo', async ({ page }) => {
    // A package nothing went out on: add one, remove it, bring it back.
    await page.goto('/p/job-a/bids?view=packages');
    await page.getByTestId('package-add').click();
    const form = page.getByTestId('new-package-form');
    await form.getByTestId('package-division').selectOption('26');
    await form.getByTestId('package-save').click();
    await expect(page.getByTestId('package-row-26A')).toBeVisible();
    await page.getByTestId('package-remove').click();
    await expect(page.getByTestId('package-row-26A')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('package-row-26A')).toBeVisible();

    await page.goto('/p/job-a/bids?view=subs');
    const steel = page.getByTestId('sub-row').filter({ hasText: 'Sample Steel Works' });
    await steel.click();
    await page.getByTestId('sub-remove').click();
    await expect(steel).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(steel).toBeVisible();
  });
});
