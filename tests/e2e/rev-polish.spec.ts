// Revs polish (Jesse, Oct 10, after using it) against the e2e mock, on Sample Science Building (job-s, src/data/mock:
// revSeeds, revRooms). Finished work folds: a done rev line to one quiet line (rev-line-<n> data-done, rev-line-open
// with its rev-done-text, opened rev-line-fold), a done wall on its room's page (data-done, rev-wall-unfold, opened
// rev-wall-fold), a done room tile and wall tile (data-done, rev-done, no chips). A manager's moves on the room page wait
// behind Edit (rev-room-edit-mode); editing, a tap on an item opens the sign-off form under its row (rev-before-form,
// rev-before-ofs / -date, the job's OFS IRs by number rev-before-ir-<n>, rev-before-off to take it off), each move with
// Undo in its toast. 'inspector' manages, 'pm' reads. Synthetic data only.
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

/** Nothing wider than the screen. */
async function fitsWidth(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

/** At least a thumb's 40px tall. */
async function thumbSized(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).first().boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
}

/** The newest toast that says this. */
const toast = (page: Page, says: string) => page.getByRole('status').filter({ hasText: says }).last();

test.describe('revs polish', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('done lines, walls and rooms fold to one quiet line; a tap opens them, Fold closes them', async ({ page }, testInfo) => {
    // Eight sign-offs to set the wall up, then three pages: past 30 s on the phone's WebKit (it timed out mid-loop on
    // main, every element found and clickable). More time, nothing loosened.
    test.slow();
    const phone = testInfo.project.name === 'phone';
    const size = page.viewportSize();
    // Corridor 210's north wall (room 210's only wall) signed off before the app, rev by rev, on its page at desktop
    // width; the form keeps the number last used (OFS 44).
    await page.setViewportSize({ width: 1280, height: 900 });
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-5');
    const wall = page.getByTestId('rev-wall-page');
    for (let n = 0; n <= 7; n += 1) {
      const rev = wall.getByTestId(`rev-section-${String(n)}`);
      await rev.getByTestId('rev-before-rev').click();
      if (n === 0) await wall.getByTestId('rev-before-ofs').fill('44');
      else await expect(wall.getByTestId('rev-before-ofs')).toHaveValue('44');
      await wall.getByTestId('rev-form-save').click();
      await expect(rev.getByTestId('rev-before-rev')).toHaveCount(0);
    }
    if (size) await page.setViewportSize(size);

    // The Rooms grid: room 210 is done (a check and "Done", no bar); room 205 is not.
    await openAs(page, 'pm', '/p/job-s/revs?level=Level%2002');
    const done = page.getByTestId('rev-room-mock-room-210');
    await expect(done).toHaveAttribute('data-done', 'true');
    await expect(done.getByTestId('rev-done')).toHaveText('Done');
    await expect(page.getByTestId('rev-room-mock-room-205')).not.toHaveAttribute('data-done', 'true');
    if (phone) await fitsWidth(page);

    // Its page: the wall folded to one line, no chips; a tap opens it, each rev a done line with its OFS number.
    await done.click();
    const row = page.getByTestId('rev-room-walls').getByTestId('rev-wall-mock-rev-area-5');
    await expect(row).toHaveAttribute('data-done', 'true');
    await expect(row.getByTestId('rev-wall-unfold')).toContainText('Corridor 210 north wall');
    await expect(row.getByTestId('rev-wall-unfold').getByTestId('rev-done-text')).toHaveText('Done');
    await expect(row.getByTestId('rev-items')).toHaveCount(0);
    if (phone) {
      await thumbSized(page, 'rev-wall-unfold');
      await fitsWidth(page);
    }
    await row.getByTestId('rev-wall-unfold').click();
    const items = row.getByTestId('rev-items');
    await expect(items.locator('[data-done="true"]')).toHaveCount(8);
    await expect(items.getByTestId('rev-line-2').getByTestId('rev-line-label')).toHaveText('Rev 2 · CJ');
    await expect(items.getByTestId('rev-line-2').getByTestId('rev-done-text')).toHaveText('Done · 0044');
    await expect(items.locator('[data-status]')).toHaveCount(0);
    // A done line opens to its items (green, with the number) and folds again.
    await items.getByTestId('rev-line-2').getByTestId('rev-line-open').click();
    await expect(items.getByTestId('rev-item-chip-mock-rev-item-2-1')).toHaveText('Stuffing · 0044');
    await expect(items.getByTestId('rev-item-chip-mock-rev-item-2-1')).toHaveAttribute('data-status', 'passed');
    await items.getByTestId('rev-line-2').getByTestId('rev-line-fold').click();
    await expect(items.locator('[data-status]')).toHaveCount(0);
    await row.getByTestId('rev-wall-fold').click();
    await expect(row.getByTestId('rev-items')).toHaveCount(0);
    await expect(row.getByTestId('rev-wall-unfold')).toBeVisible();

    // The Walls view: the wall's tile is done too, with its number and no chips; a tap still opens the wall.
    await openAs(page, 'pm', '/p/job-s/revs?view=list&level=Level%2002');
    const tile = page.getByTestId('rev-wall-mock-rev-area-5');
    await expect(tile).toHaveAttribute('data-done', 'true');
    await expect(tile.getByTestId('rev-done')).toHaveText('Done · 0044');
    await expect(tile.getByTestId('rev-items')).toHaveCount(0);
    await expect(page.getByTestId('rev-wall-mock-rev-area-4')).not.toHaveAttribute('data-done', 'true');
    await tile.getByTestId('rev-wall-open').click();
    await expect(page).toHaveURL(/\/p\/job-s\/revs\/mock-rev-area-5/);
  });

  test('a manager signs an item off from the room page in Edit, changes it and takes it off, each with Undo', async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    // A reader has no Edit.
    await openAs(page, 'pm', '/p/job-s/revs/room-mock-room-110');
    await expect(page.getByTestId('rev-room-page')).toBeVisible();
    await expect(page.getByTestId('rev-room-edit-mode')).toHaveCount(0);

    await openAs(page, 'inspector', '/p/job-s/revs/room-mock-room-110');
    const room = page.getByTestId('rev-room-page');
    const row = room.getByTestId('rev-room-walls').getByTestId('rev-wall-mock-rev-area-1');
    const beams = row.getByTestId('rev-item-chip-mock-rev-item-1-3');
    await expect(beams).toHaveAttribute('data-status', 'open');
    await room.getByTestId('rev-room-edit-mode').click();
    // Editing: every line open; what passed in the app can't change.
    await expect(row.getByTestId('rev-item-chip-mock-rev-item-0-1')).toBeDisabled();

    // A new sign-off: OFS 42, its IR on file picked from the short list, the day.
    await beams.click();
    const form = row.getByTestId('rev-before-form');
    await expect(form).toContainText('HOW Beam Pockets');
    await expect(form.getByTestId('rev-before-off')).toHaveCount(0);
    await form.getByTestId('rev-before-ir-42').click();
    await expect(form.getByTestId('rev-before-ofs')).toHaveValue('42');
    await expect(form.getByTestId('rev-before-ir-42')).toHaveAttribute('aria-pressed', 'true');
    await form.getByTestId('rev-before-date').fill('2026-09-21');
    if (phone) {
      await thumbSized(page, 'rev-before-ir-42');
      await thumbSized(page, 'rev-form-save');
      await fitsWidth(page);
    }
    await form.getByTestId('rev-form-save').click();
    await expect(form).toHaveCount(0);
    await expect(beams).toHaveAttribute('data-status', 'passed');
    await expect(beams).toHaveText('Beam Pockets · 0042');
    await expect(beams).toHaveAttribute('data-file', 'true');
    // Undo takes it off.
    await toast(page, 'signed off before.').getByRole('button', { name: 'Undo' }).click();
    await expect(beams).toHaveAttribute('data-status', 'open');

    // Again: the form opens with the number and day last used.
    await beams.click();
    await expect(form.getByTestId('rev-before-ofs')).toHaveValue('42');
    await expect(form.getByTestId('rev-before-date')).toHaveValue('2026-09-21');
    await form.getByTestId('rev-form-save').click();
    await expect(beams).toHaveText('Beam Pockets · 0042');

    // Changed to OFS 41 (its own IR); Undo puts 0042 back, IR and all.
    await beams.click();
    await expect(form.getByTestId('rev-before-ofs')).toHaveValue('42');
    await form.getByTestId('rev-before-ofs').fill('41');
    await expect(form.getByTestId('rev-before-ir-41')).toHaveAttribute('aria-pressed', 'true');
    await form.getByTestId('rev-form-save').click();
    await expect(beams).toHaveText('Beam Pockets · 0041');
    await expect(beams).toHaveAttribute('data-file', 'true');
    await toast(page, 'changed.').getByRole('button', { name: 'Undo' }).click();
    await expect(beams).toHaveText('Beam Pockets · 0042');
    await expect(beams).toHaveAttribute('data-file', 'true');

    // Take off, no "are you sure"; Undo puts it back.
    await beams.click();
    await form.getByTestId('rev-before-off').click();
    await expect(beams).toHaveAttribute('data-status', 'open');
    await toast(page, 'not signed off.').getByRole('button', { name: 'Undo' }).click();
    await expect(beams).toHaveText('Beam Pockets · 0042');

    // Out of Edit, HOW cavity is done on this wall (two passed in the app, OFS 0006, and this one): one line. Opened, a
    // tap does what it does for everyone: the passed item's OFS IR opens.
    await room.getByTestId('rev-room-edit-mode').click();
    await expect(room.getByTestId('rev-room-edit-mode')).toHaveAttribute('aria-pressed', 'false');
    const how = row.getByTestId('rev-line-1');
    await expect(how.getByTestId('rev-done-text')).toHaveText('Done · 0006, 0042');
    await how.getByTestId('rev-line-open').click();
    await beams.click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByTestId('viewer-name')).toHaveText('OFS_IR_0042_Attachment.pdf');
    await viewer.getByTestId('viewer-close').click();
  });
});
