// Revs files without a black hole (migration 0094) against the e2e mock. Sample Science Building (job-s): room 205
// Electrical's picture name is "Sample Room 205.png" and it has no picture yet, room 110 Corridor has one
// (src/data/mock/revRooms.ts). 'inspector' manages Revs, 'pm' reads. Synthetic files only.
// Test ids: rev-files (Setup's card), rev-files-add, rev-files-input, rev-link-files, upload-line, upload-line-status,
// room-image, room-no-image, room-picture-add, room-picture-replace, room-picture-input, room-download, sheet-image.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. */
async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.goto('/');
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

const file = (name: string, mimeType: string) => ({ name, mimeType, buffer: Buffer.from(`synthetic ${name}`) });

test.describe('revs files', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('Setup adds pictures and IRs in one go: each links at once, one toast says what matched', async ({ page }) => {
    await openAs(page, 'inspector', '/p/job-s/revs?view=setup');
    const card = page.getByTestId('rev-files');
    await expect(card.getByTestId('rev-files-add')).toBeVisible();
    await card.getByTestId('rev-files-input').setInputFiles([
      file('Sample Room 205.png', 'image/png'),
      file('Sample Stray.png', 'image/png'),
      file('OFS_IR_0099.pdf', 'application/pdf'),
    ]);
    const toast = page.getByText(/^1 picture linked\. Not matched: /);
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Sample Stray.png');
    await expect(toast).toContainText('OFS_IR_0099.pdf');
    const lines = card.getByTestId('upload-line');
    await expect(lines).toHaveCount(3);
    await expect(lines.filter({ hasText: 'Sample Room 205.png' }).getByTestId('upload-line-status')).toHaveText('Linked');
    await expect(lines.filter({ hasText: 'Sample Stray.png' }).getByTestId('upload-line-status')).toHaveText('Not matched');

    // Room 205 shows its picture now.
    await openAs(page, 'pm', '/p/job-s/revs/room-mock-room-205');
    await expect(page.getByTestId('room-image').getByTestId('sheet-image')).toBeVisible();
    // A reader adds or replaces nothing.
    await expect(page.getByTestId('room-picture-replace')).toHaveCount(0);
  });

  test("a manager adds a room's picture on its page (Undo takes it off) and replaces one", async ({ page }) => {
    await openAs(page, 'inspector', '/p/job-s/revs/room-mock-room-205');
    const image = page.getByTestId('room-image');
    await expect(image.getByTestId('room-no-image')).toBeVisible();
    await image.getByTestId('room-picture-input').setInputFiles(file('Sample Electrical 205.png', 'image/png'));
    await expect(page.getByText('Picture added.')).toBeVisible();
    await expect(image.getByTestId('sheet-image')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(image.getByTestId('room-picture-add')).toBeVisible();

    await openAs(page, 'inspector', '/p/job-s/revs/room-mock-room-110');
    const corridor = page.getByTestId('room-image');
    await expect(corridor.getByTestId('sheet-image')).toBeVisible();
    await expect(corridor.getByTestId('room-picture-replace')).toBeVisible();
    await corridor.getByTestId('room-picture-input').setInputFiles(file('Sample Corridor 110 new.png', 'image/png'));
    await expect(page.getByText('Picture replaced.')).toBeVisible();
    await expect(corridor.getByTestId('room-download')).toHaveAttribute('aria-label', 'Download Sample Corridor 110 new.png');

    await openAs(page, 'pm', '/p/job-s/revs/room-mock-room-210');
    await expect(page.getByTestId('room-image').getByTestId('sheet-image')).toBeVisible();
    await expect(page.getByTestId('room-picture-replace')).toHaveCount(0);
  });
});
