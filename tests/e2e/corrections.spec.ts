// Corrections log (SPEC §13.4) against the e2e mock: an inspector opens CN-001, a sub marks it ready with a note,
// the inspector signs it off in one tap and adds a note after. The mock follows the database's rule that only
// corrections.close decides, so the sub never sees Sign off and the inspector never sees Mark ready. Also: Edit adds
// and removes an item's photos (Undo), the notice is filed among the job's documents, Undo stays on the item after the
// toast, the log folds under the title when narrow, and the phone's "No photo". Mock users: 'inspector' and 'sub'.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
/** A 1 x 1 PNG: a real image, so the photo compressor can read it. */
const PHOTO = {
  name: 'sample-photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
};
const NOTICE = { name: 'Sample notice 12.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% sample notice\n%%EOF\n') };

/** Switches the mock user and opens the log. The mock's data stays in this tab's sessionStorage. */
async function openLogAs(page: Page, who: string): Promise<void> {
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto('/p/job-a/corrections');
}

test.describe('corrections log (SPEC §13.4)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('inspector opens CN-001, a sub marks it ready, the inspector signs it off', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The right column is the desktop frame.');
    await page.goto('/');

    // Inspector: a new item gets CN-001 from the numbering, and opens on the right.
    await openLogAs(page, 'inspector');
    await expect(page.getByText('No corrections yet.')).toBeVisible();
    await page.getByTestId('cn-new').click();
    await page.getByTestId('cn-title').fill('Sample firestop gap at duct');
    await page.getByTestId('cn-trade').fill('Sample Drywall');
    await page.getByTestId('cn-location').fill('Level 2 corridor');
    await page.getByTestId('cn-save').click();
    await expect(page.getByTestId('log-row-CN-001')).toBeVisible();
    await expect(page.getByTestId('cn-status')).toHaveText('Open');

    // Sub: marks it ready with a note. No inspector steps offered.
    await openLogAs(page, 'sub');
    await page.getByTestId('log-row-CN-001').click();
    await expect(page.getByTestId('cn-step-ready')).toBeVisible();
    await expect(page.getByTestId('cn-step-signed_off')).toHaveCount(0);
    await expect(page.getByTestId('cn-new')).toHaveCount(0);
    await page.getByTestId('cn-step-ready').click();
    await page.getByTestId('cn-step-note').fill('Sealed per sample detail');
    await page.getByTestId('cn-step-confirm').click();
    await expect(page.getByTestId('cn-status')).toHaveText('Ready');

    // Inspector: reads the sub's note and signs off.
    await openLogAs(page, 'inspector');
    await page.getByTestId('log-row-CN-001').click();
    await expect(page.getByTestId('cn-latest')).toContainText('Sealed per sample detail');
    await expect(page.getByTestId('cn-step-ready')).toHaveCount(0);
    // One tap signs off (no form, no confirm); a note goes on after, once.
    await page.getByTestId('cn-step-signed_off').click();
    await expect(page.getByTestId('cn-status')).toHaveText('Signed off');
    await expect(page.getByTestId('cn-step-form')).toHaveCount(0);
    await page.getByTestId('cn-add-note').click();
    await page.getByTestId('cn-note-text').fill('Sample: sealant checked at the sleeve');
    await page.getByTestId('cn-note-save').click();
    await expect(page.getByTestId('cn-latest')).toContainText('Sample: sealant checked at the sleeve');
    await expect(page.getByTestId('cn-add-note')).toHaveCount(0);

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByTestId('cn-history').getByRole('listitem')).toHaveCount(3);
    await expect(page.getByTestId('log-row-CN-001')).toContainText('Signed off');
  });

  test('Edit adds and removes photos; the notice is a document; Undo stays on the item after the toast', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The right column is the desktop frame.');
    await page.goto('/');
    await openLogAs(page, 'inspector');
    await page.getByTestId('cn-new').click();
    await page.getByTestId('cn-title').fill('Sample missing hanger wire');
    await expect(page.getByLabel('Notice no.')).toBeVisible();
    await page.getByTestId('cn-photo-input').setInputFiles(PHOTO);
    await expect(page.getByTestId('cn-picked-photo')).toHaveCount(1);
    await page.getByTestId('cn-notice-input').setInputFiles(NOTICE);
    await expect(page.getByText('Sample notice 12.pdf')).toBeVisible();
    await page.getByTestId('cn-save').click();
    await expect(page.getByTestId('log-row-CN-001')).toBeVisible();

    // The notice went to its own folder, never among the photos.
    const folders = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('e2e-mock-state') ?? '{}';
      const files = (JSON.parse(raw) as { files?: { original_name: string; folder_id: string }[] }).files ?? [];
      return Object.fromEntries(files.map((f) => [f.original_name, f.folder_id]));
    });
    expect(folders['Sample notice 12.pdf']).toMatch(/-corrections-notices$/);
    expect(folders['Sample notice 12.pdf']).not.toBe(folders['sample-photo.jpg']);

    // Edit: the item's photo shows with its X; take it off (Undo puts it back), add another, save.
    await page.getByTestId('cn-edit').click();
    await expect(page.getByTestId('cn-kept-photo')).toHaveCount(1);
    await page.getByTestId('cn-kept-photo').getByRole('button').click();
    await expect(page.getByTestId('cn-kept-photo')).toHaveCount(0);
    await page.getByRole('status').filter({ hasText: 'Photo removed' }).getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('cn-kept-photo')).toHaveCount(1);
    await page.getByTestId('cn-photo-input').setInputFiles(PHOTO);
    await expect(page.getByTestId('cn-picked-photo')).toHaveCount(1);
    await page.getByTestId('cn-edit-save').click();
    await expect(page.getByTestId('cn-edit-save')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Photos' }).first().getByRole('listitem')).toHaveCount(2);

    // A second item: once the toast has gone, its Undo is still on the item, and it takes the item away.
    await page.getByTestId('cn-new').click();
    await page.getByTestId('cn-title').fill('Sample made by mistake');
    await page.getByTestId('cn-save').click();
    await expect(page.getByTestId('log-row-CN-002')).toBeVisible();
    await page.getByRole('status').filter({ hasText: 'CN-002 opened' }).getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'CN-002 opened' })).toHaveCount(0);
    await page.getByTestId('cn-undo').click();
    await expect(page.getByTestId('log-row-CN-002')).toHaveCount(0);
    await expect(page.getByTestId('log-row-CN-001')).toBeVisible();
  });

  test('the log folds trade, location and dates under the title when it is narrow', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The phone has its own stacked list.');
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await openLogAs(page, 'inspector');
    await page.getByTestId('cn-new').click();
    await page.getByTestId('cn-title').fill('Sample long title for a narrow log that should wrap without being squeezed to nothing');
    await page.getByTestId('cn-trade').fill('Sample Drywall');
    await page.getByTestId('cn-location').fill('Level 2 corridor');
    await page.getByTestId('cn-save').click();
    const row = page.getByTestId('log-row-CN-001');
    await expect(page.getByTestId('cn-log')).toHaveAttribute('data-folded', 'true');
    await expect(row.getByTestId('cn-row-under')).toContainText('Sample Drywall');
    await expect(row.getByTestId('cn-row-under')).toContainText('Level 2 corridor');
    await expect(page.getByTestId('cn-sort-trade')).toHaveCount(0);
    const box = await page.getByTestId('cn-log').boundingBox();
    const main = await page.getByTestId('main-area').boundingBox();
    expect(box && main ? box.width <= main.width : false).toBe(true);
    // Closed column wide again: every column back.
    await page.setViewportSize({ width: 1600, height: 800 });
    await expect(page.getByTestId('cn-log')).not.toHaveAttribute('data-folded', 'true');
    await expect(page.getByTestId('cn-sort-trade')).toBeVisible();
  });

  test('phone: New without a photo opens the form at once; no "Open in new window"', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The phone frame.');
    await page.goto('/');
    await openLogAs(page, 'inspector');
    await page.getByTestId('cn-new-plain').click();
    await page.getByTestId('cn-title').fill('Sample loose cover plate');
    await page.getByTestId('cn-save').click();
    await expect(page.getByTestId('cn-status')).toHaveText('Open');
    await expect(page.getByRole('button', { name: 'Open in new window' })).toHaveCount(0);
  });
});
