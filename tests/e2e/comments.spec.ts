// Comments on any item (migration 0050) against the e2e mock: they show in an item's full view (its own window,
// expanded to full width, or the phone), never in the right-column preview. A comment is permanent: its author can
// edit it, the earlier text stays readable under it, and there is no delete. A bidder reads but cannot write.
// Sample Job A's RFI 002 starts with two comments, one of them edited (src/data/mock/comments.ts). Test ids: comments,
// comment, comment-body, comment-meta, comment-earlier, comment-edit, comment-edit-input, comment-save, comment-input,
// comment-send, comments-empty.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const RFI = '/p/job-a/rfis/mock-rfi-job-a-2';
const FILE = '/p/job-a/files/job-a-file-1';

async function signIn(page: Page, who: string, path: string): Promise<void> {
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto(path);
}

test.describe('comments', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('add a comment in the full view, edit it, the original stays, nothing deletes', async ({ page }) => {
    await signIn(page, 'pm', `${RFI}?window=1`);
    const panel = page.getByTestId('comments');
    await expect(panel.getByTestId('comment')).toHaveCount(2);
    await expect(panel.getByTestId('comment').first().getByTestId('comment-earlier')).toContainText('Sample: confirm the clip type first.');

    await page.getByTestId('comment-input').fill('Sample: clips are on site, re-anchoring starts tomorrow.');
    await page.getByTestId('comment-send').click();
    const mine = panel.getByTestId('comment').nth(2);
    await expect(mine.getByTestId('comment-body')).toHaveText('Sample: clips are on site, re-anchoring starts tomorrow.');
    await expect(page.getByTestId('comment-input')).toHaveValue('');
    // Only my own comment has Edit.
    await expect(panel.getByTestId('comment-edit')).toHaveCount(1);

    await mine.getByTestId('comment-edit').click();
    await page.getByTestId('comment-edit-input').fill('Sample: clips are on site; re-anchoring starts Thursday.');
    await page.getByTestId('comment-save').click();
    await expect(mine.getByTestId('comment-body')).toHaveText('Sample: clips are on site; re-anchoring starts Thursday.');
    await expect(mine.getByTestId('comment-meta')).toContainText('Edited');
    await expect(mine.getByTestId('comment-earlier')).toContainText('Sample: clips are on site, re-anchoring starts tomorrow.');

    await expect(panel.getByRole('button', { name: /delete|remove/i })).toHaveCount(0);

    // Permanent across a reload of the same session.
    await page.reload();
    await expect(page.getByTestId('comments').getByTestId('comment')).toHaveCount(3);
  });

  test('the right-column preview has no comments; full width shows them', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'The phone has no preview column.');
    await signIn(page, 'pm', RFI);
    await expect(page.getByTestId('right-column')).toBeVisible();
    await expect(page.getByTestId('comments')).toHaveCount(0);
    await page.getByRole('button', { name: 'Full width' }).click();
    await expect(page.getByTestId('comments').getByTestId('comment')).toHaveCount(2);
  });

  test('a file in its own window starts empty and takes a comment', async ({ page }) => {
    await signIn(page, 'pm', `${FILE}?window=1`);
    await expect(page.getByTestId('comments-empty')).toBeVisible();
    await page.getByTestId('comment-input').fill('Sample: sheet A-501 here is superseded.');
    await page.getByTestId('comment-input').press('Enter');
    await expect(page.getByTestId('comment-body')).toHaveText('Sample: sheet A-501 here is superseded.');
    await expect(page.getByTestId('comments-empty')).toHaveCount(0);
  });

  test('a bidder reads comments but gets no box', async ({ page }) => {
    await signIn(page, 'bidder', `${FILE}?window=1`);
    await expect(page.getByTestId('comments')).toBeVisible();
    await expect(page.getByTestId('comment-input')).toHaveCount(0);
  });
});
