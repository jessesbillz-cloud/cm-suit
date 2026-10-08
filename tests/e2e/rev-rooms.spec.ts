// Revs rooms (migration 0083) against the e2e mock. Sample Science Building (job-s) has four synthetic rooms
// (src/data/mock/revRooms.ts): Level 01 room 110 Corridor (the corridor's north wall and the stair shaftwall, its image
// linked), Level 02 room 205 Electrical (its east wall and the corridor's north wall, its image in Files but not linked
// yet), room 210 Corridor (the corridor's north wall, shared with 205) and shaft S2 Stair 2. Level 01's elevator shaft
// is in no room. 'pm' reads, 'inspector' also manages. Synthetic pictures only.
// Test ids: rev-rooms, rev-room-<id> (a tile; data-kind), rev-room-thumb, rev-other-walls, rev-room-page, rev-room-name,
// rev-room-progress, room-image (the viewer; data-full) with sheet-image, sheet-zoom, sheet-fit and its walls'
// [data-wall] and plan-wall-<area> callouts, rev-room-edit / rev-room-number / rev-room-name-input, rev-room-remove,
// rev-room-out-<area>, rev-room-add-pick / rev-room-add, rev-room-draw-<area>, rev-room-picker / rev-room-pick (the
// wall page's little picker; rev-room-pick-line) / rev-room-switch-<room> / rev-room-open, rev-wall-back (named for the
// room), rev-history, rev-history-<item>, rev-history-row (data-kind), rev-history-open, rev-file-pane,
// rev-link-files, file-viewer, viewer-zoom. Oct 6: rev-level-<level> (the level chips), rev-room-walls (the room's
// rows, each rev-wall-<area> with rev-wall-open and its rev-strip of rev-chip-<rev number>, data-mark / data-file).
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

/** A tap on the room image's frame (fractions of it): a click, or a finger on the phone. */
async function tapFrame(page: Page, fx: number, fy: number, phone: boolean): Promise<void> {
  const frame = page.getByTestId('room-image').getByTestId('sheet-frame');
  await frame.scrollIntoViewIfNeeded();
  const b = await frame.boundingBox();
  if (b === null) throw new Error('The room has no frame.');
  const [x, y] = [b.x + b.width * fx, b.y + b.height * fy];
  if (phone) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Link files from Setup (a manager): the room pictures by name, the OFS IRs by number. */
async function linkFiles(page: Page, said: string): Promise<void> {
  await openAs(page, 'inspector', '/p/job-s/revs?view=setup');
  await page.getByTestId('rev-link-files').click();
  await expect(page.getByText(said)).toBeVisible();
}

test.describe('revs rooms', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test("rooms by level, a room's page with its walls drawn on its image; a line opens the wall, Back comes to the room", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    await openAs(page, 'pm', '/p/job-s/revs');
    const rooms = page.getByTestId('rev-rooms');
    // Level first: Level 01's rooms, not Level 02's.
    await expect(page.getByTestId('rev-level-Level 01')).toHaveAttribute('aria-pressed', 'true');
    const corridor = rooms.getByTestId('rev-room-mock-room-110');
    await expect(corridor).toContainText('110');
    await expect(corridor).toContainText('Corridor');
    await expect(corridor).toContainText('2 walls');
    await expect(corridor.getByTestId('rev-room-thumb').locator('img')).toBeVisible();
    await expect(rooms.getByTestId('rev-room-mock-room-s2')).toHaveCount(0);
    // The elevator shaft is in no room: it is still there.
    await expect(rooms.getByTestId('rev-other-walls')).toBeVisible();
    await expect(rooms.getByTestId('rev-wall-mock-rev-area-3')).toBeVisible();
    await expect(page.getByTestId('rev-view-list')).toBeVisible();

    await page.getByTestId('rev-level-Level 02').click();
    await expect(page).toHaveURL(/level=Level(%20|\+)02/);
    await expect(rooms.getByTestId('rev-room-mock-room-s2')).toHaveAttribute('data-kind', 'shaft');
    await expect(rooms.getByTestId('rev-room-mock-room-s2')).toContainText('Shaft');
    await expect(rooms.getByTestId('rev-room-mock-room-110')).toHaveCount(0);
    // The level stays from view to view.
    await page.getByTestId('rev-view-list').click();
    await expect(page.getByTestId('rev-wall-mock-rev-area-5')).toBeVisible();
    await expect(page.getByTestId('rev-wall-mock-rev-area-2')).toHaveCount(0);
    await page.getByTestId('rev-view-rooms').click();
    await expect(page.getByTestId('rev-level-Level 02')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('rev-level-Level 01').click();

    await corridor.click();
    await expect(page).toHaveURL(/\/p\/job-s\/revs\/room-mock-room-110/);
    const room = page.getByTestId('rev-room-page');
    await expect(room.getByTestId('rev-room-name')).toHaveText('110 Corridor');
    const image = room.getByTestId('room-image');
    await expect(image.getByTestId('sheet-image')).toBeVisible();
    await expect(image.locator('[data-wall]')).toHaveCount(2);
    // Corridor 110's north wall failed an item: red.
    await expect(image.locator('[data-wall="mock-rev-area-2"] polyline').nth(1)).toHaveAttribute('stroke', 'var(--status-not_approved-solid)');
    await expect(image.getByTestId('sheet-zoom')).toBeVisible();
    // Then its walls, each with its revs: TOW passed, HOW failed on the north wall.
    await expect(room.getByTestId('rev-wall-mock-rev-area-1')).toBeVisible();
    const north = room.getByTestId('rev-room-walls').getByTestId('rev-wall-mock-rev-area-2');
    await expect(north.getByTestId('rev-chip-0')).toHaveAttribute('data-mark', 'done');
    await expect(north.getByTestId('rev-chip-1')).toHaveAttribute('data-mark', 'failed');
    // A reader has no manager's buttons.
    await expect(room.getByTestId('rev-room-edit')).toHaveCount(0);
    await expect(room.getByTestId('rev-room-add-pick')).toHaveCount(0);
    await expect(room.getByTestId('rev-room-out-mock-rev-area-2')).toHaveCount(0);
    await expect(room.getByTestId('rev-room-draw-mock-rev-area-2')).toHaveCount(0);

    await image.getByTestId('plan-wall-mock-rev-area-2').click();
    await expect(page).toHaveURL(/\/mock-rev-area-2\?room=mock-room-110/);
    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-room-pick-line')).toBeVisible();
    await expect(page.getByTestId('rev-wall-back')).toHaveText('110 Corridor');
    await page.getByTestId('rev-wall-back').click();
    await expect(page.getByTestId('rev-room-page')).toBeVisible();
    if (phone) await expect(page.getByTestId('room-image').getByRole('button', { name: 'Zoom in' })).toBeInViewport();
  });

  test('a shared wall shows its rooms with a switch; the picker opens the room full screen with zoom', async ({ page }) => {
    await linkFiles(page, '1 picture linked.');
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-5');
    const picker = page.getByTestId('rev-room-picker');
    await expect(picker.getByTestId('rev-room-switch-mock-room-205')).toHaveAttribute('aria-pressed', 'true');
    await expect(picker.getByTestId('rev-room-open')).toHaveText('205 Electrical');
    await picker.getByTestId('rev-room-switch-mock-room-210').click();
    await expect(picker.getByTestId('rev-room-open')).toHaveText('210 Corridor');

    await picker.getByTestId('rev-room-pick').click();
    const full = page.getByTestId('room-image');
    await expect(full).toHaveAttribute('data-full', 'true');
    const frame = full.getByTestId('sheet-frame');
    await expect(full.getByTestId('sheet-zoom')).toBeVisible();
    await expect(full.getByTestId('sheet-image')).toBeVisible();
    const z0 = (await frame.getAttribute('data-zoom')) ?? '';
    await full.getByRole('button', { name: 'Zoom in' }).click();
    await expect(frame).not.toHaveAttribute('data-zoom', z0);
    await full.getByTestId('sheet-fit').click();
    await expect(frame).toHaveAttribute('data-zoom', '1.00');
    await full.getByTestId('sheet-exit').click();
    await expect(page.getByTestId('room-image')).toHaveCount(0);
  });

  test("the wall's history: an in-app request opens beside the page, a sign-off before the app opens its OFS IR", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    // Signed off before the app with OFS IR 41, then its file linked.
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-2');
    const wall = page.getByTestId('rev-wall-page');
    await wall.getByTestId('rev-item-mock-rev-item-2-1').click();
    await wall.getByTestId('rev-before').click();
    await wall.getByTestId('rev-before-ofs').fill('41');
    await wall.getByTestId('rev-before-date').fill('2026-08-20');
    await wall.getByTestId('rev-form-save').click();
    await expect(wall.getByTestId('rev-before-line')).toBeVisible();
    await linkFiles(page, '1 picture and 1 IR linked.');

    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-2');
    const history = page.getByTestId('rev-history');
    const tow = history.getByTestId('rev-history-mock-rev-item-0-1');
    await expect(tow).toContainText('IR 5 · OFS 0005');
    await expect(tow).toContainText('Passed');
    const spray = history.getByTestId('rev-history-mock-rev-item-1-2');
    await expect(spray).toContainText('Failed');
    await expect(spray).toContainText('Sample gaps at the deflection track');
    const before = history.getByTestId('rev-history-mock-rev-item-2-1');
    await expect(before.getByTestId('rev-history-row')).toHaveAttribute('data-kind', 'before');
    await expect(before).toContainText('OFS 0041 · Aug 20, 2026 · Before app');

    if (phone) {
      await before.getByTestId('rev-history-open').click();
      const viewer = page.getByTestId('file-viewer');
      await expect(viewer.getByTestId('viewer-name')).toHaveText('OFS_IR_0041_Attachment.pdf');
      await expect(viewer.getByTestId('viewer-zoom')).toBeVisible();
      await expect(viewer.getByRole('button', { name: 'Zoom in' })).toBeInViewport();
      await viewer.getByTestId('viewer-close').click();
      await tow.getByTestId('rev-history-open').click();
      await expect(page).toHaveURL(/\/p\/job-s\/inspections\/mock-ir-revs-5/);
      return;
    }

    // Desktop: beside the page, in the right column; the wall stays in the main area.
    await tow.getByTestId('rev-history-open').click();
    await expect(page).toHaveURL(/side=inspections/);
    const right = page.getByTestId('right-column');
    await expect(page.getByTestId('right-column-title')).toHaveText('Inspection');
    await expect(page.getByTestId('main-area').getByTestId('rev-wall-page')).toBeVisible();
    await before.getByTestId('rev-history-open').click();
    await expect(page.getByTestId('right-column-title')).toHaveText('File');
    const pane = right.getByTestId('rev-file-pane');
    await expect(pane).toContainText('OFS_IR_0041_Attachment.pdf');
    await expect(pane.getByTestId('viewer-zoom')).toBeVisible();
    await pane.getByTestId('file-preview-full').click();
    await expect(page.getByTestId('file-viewer').getByTestId('viewer-zoom')).toBeVisible();
    await page.getByTestId('file-viewer').getByTestId('viewer-close').click();
    await right.getByRole('button', { name: 'Close' }).click();
    await expect(page).not.toHaveURL(/side=/);
    await expect(page.getByTestId('main-area').getByTestId('rev-wall-page')).toBeVisible();
  });

  test("a manager renames the room, takes a wall out and puts it back, adds one and draws its line", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    await openAs(page, 'inspector', '/p/job-s/revs/room-mock-room-110');
    const room = page.getByTestId('rev-room-page');
    await room.getByTestId('rev-room-edit').click();
    await room.getByTestId('rev-room-number').fill('111');
    await room.getByTestId('rev-room-name-input').fill('Hall');
    await room.getByTestId('rev-form-save').click();
    await expect(room.getByTestId('rev-room-name')).toHaveText('111 Hall');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(room.getByTestId('rev-room-name')).toHaveText('110 Corridor');

    await room.getByTestId('rev-room-out-mock-rev-area-1').click();
    await expect(room.getByTestId('rev-wall-mock-rev-area-1')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(room.getByTestId('rev-wall-mock-rev-area-1')).toBeVisible();
    await expect(room.getByTestId('room-image').locator('[data-wall="mock-rev-area-1"]')).toHaveCount(1);

    // Add wall offers only this level's walls not in the room (the elevator shaft), and adds it when picked.
    const pick = room.getByTestId('rev-room-add-pick');
    await expect(pick.locator('option')).toHaveText(['Add wall', 'Elevator 1 shaft (E / 1–2)']);
    await pick.selectOption('mock-rev-area-3');
    await expect(room.getByTestId('rev-wall-mock-rev-area-3')).toBeVisible();
    await room.getByTestId('rev-room-draw-mock-rev-area-3').click();
    await expect(page.getByTestId('plan-draw-bar')).toBeVisible();
    await tapFrame(page, 0.3, 0.6, phone);
    await tapFrame(page, 0.7, 0.6, phone);
    await expect(page.getByTestId('plan-draw-bar')).toHaveAttribute('data-points', '2');
    await page.getByTestId('plan-done').click();
    await expect(room.getByTestId('room-image').locator('[data-wall="mock-rev-area-3"]')).toHaveCount(1);
    await expect(room.getByTestId('rev-room-draw-mock-rev-area-3')).toHaveText('Redraw');
  });
  test("a room with no picture: nothing for a reader; a manager gets a slim place, no Draw, and Take out with Undo", async ({ page }, testInfo) => {
    await openAs(page, 'pm', '/p/job-s/revs/room-mock-room-205?level=Level%2002');
    const room = page.getByTestId('rev-room-page');
    await expect(room.getByTestId('rev-wall-mock-rev-area-6')).toBeVisible();
    await expect(room.getByTestId('room-image')).toHaveCount(0);

    // The fire marshal manages revs too (View as): the same buttons as the inspector.
    await openAs(page, 'ahj', '/p/job-s/revs/room-mock-room-205?level=Level%2002');
    await expect(room.getByTestId('room-image')).toBeVisible();
    await expect(room.getByTestId('room-image').getByTestId('sheet-full')).toBeHidden();
    await expect(room.getByTestId('rev-room-draw-mock-rev-area-6')).toHaveCount(0);
    await expect(room.getByTestId('rev-room-add-pick').locator('option')).toHaveText(['Add wall', 'Shaftwall at Stair 2 (C–D / 3–4)']);
    await room.getByTestId('rev-room-out-mock-rev-area-6').click();
    await expect(room.getByTestId('rev-wall-mock-rev-area-6')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(room.getByTestId('rev-wall-mock-rev-area-6')).toBeVisible();
    // Back keeps the level (a phone's screen has its own Back).
    if (testInfo.project.name === 'desktop') {
      await page.getByTestId('rev-room-back').click();
      await expect(page).toHaveURL(/\/p\/job-s\/revs\?level=Level(%20|\+)02$/);
      await expect(page.getByTestId('rev-room-mock-room-205')).toBeVisible();
    }
  });

  test("a done rev's chip opens its OFS IR; any other chip opens the wall", async ({ page }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    // CJ signed off before the app on Corridor 110's north wall with OFS IR 41, then its file linked.
    await openAs(page, 'inspector', '/p/job-s/revs/mock-rev-area-2');
    const wall = page.getByTestId('rev-wall-page');
    await wall.getByTestId('rev-section-2').getByTestId('rev-before-rev').click();
    await wall.getByTestId('rev-before-ofs').fill('41');
    await wall.getByTestId('rev-form-save').click();
    await expect(wall.getByTestId('rev-wall-strip').getByTestId('rev-chip-2')).toHaveAttribute('data-mark', 'done');
    await linkFiles(page, '1 picture and 2 IRs linked.');

    await openAs(page, 'pm', '/p/job-s/revs/room-mock-room-110');
    const row = page.getByTestId('rev-room-walls').getByTestId('rev-wall-mock-rev-area-2');
    const cj = row.getByTestId('rev-chip-2');
    await expect(cj).toHaveAttribute('data-mark', 'done');
    await expect(cj).toHaveAttribute('data-file', 'true');
    await expect(cj).toHaveText('2 · 0041');
    await cj.click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByTestId('viewer-name')).toHaveText('OFS_IR_0041_Attachment.pdf');
    if (phone) await expect(viewer.getByRole('button', { name: 'Zoom in' })).toBeInViewport();
    await viewer.getByTestId('viewer-close').click();

    // TOW passed in the app (no file of its own here): the wall, with its way back to the room.
    await row.getByTestId('rev-chip-0').click();
    await expect(page).toHaveURL(/\/mock-rev-area-2\?room=mock-room-110/);
    await expect(page.getByTestId('rev-wall-page').getByTestId('rev-wall-strip').getByTestId('rev-chip-2')).toHaveText('2 CJ · 0041');
  });
});
