// Photos and notes of walls, rooms and requests (migration 0102; Jesse, Oct 12: "go take a picture of all our walls the
// way they are right now ... on the inspection request ... attach a photo, or add a comment, a note") against the e2e
// mock. Sample Science Building (job-s): room 110 Corridor holds the corridor's north wall (mock-rev-area-2) and the
// stair shaftwall (mock-rev-area-1). 'pm' adds photos to the walls, 'sub' files an OFS request and adds a photo to one
// of its walls, 'architect' reads the walls' photos and adds none. Synthetic photos only.
// Test ids: rev-wall-photos, rev-room-photos, ir-wall-photos (each section, data-count), rev-photo-box, rev-photo-input,
// rev-photo-note, rev-photo-save, rev-photo-wall-<area> (the wall picker), rev-photos, rev-photo (data-kind note for a
// note alone), rev-photo-note-text, rev-photo-request (the IR it was added on).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const NORTH = 'mock-rev-area-2';
const ITEM = 'mock-rev-item-3-1';

/** A 1 x 1 PNG: a real image, so the photo compressor can read it. */
const PHOTO = {
  name: 'sample-wall.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
};

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

test.describe('wall photos', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a photo with a note on a wall shows on the wall and on its room', async ({ page }) => {
    await openAs(page, 'pm', `/p/job-s/revs/${NORTH}?room=mock-room-110`);
    const section = page.getByTestId('rev-wall-photos');
    await expect(section.getByTestId('rev-photo-box')).toBeVisible();
    await expect(section.getByTestId('rev-photo')).toHaveCount(0);
    await expect(section.getByTestId('rev-photo-save')).toBeDisabled();
    await section.getByTestId('rev-photo-input').setInputFiles(PHOTO);
    await expect(section.getByTestId('cn-picked-photo')).toHaveCount(1);
    await section.getByTestId('rev-photo-note').fill('Drywall back off at the head');
    await section.getByTestId('rev-photo-save').click();
    const photo = section.getByTestId('rev-photo');
    await expect(photo).toHaveCount(1);
    await expect(photo).toContainText('Drywall back off at the head');
    await expect(photo).toContainText('Sample PM');
    // The box starts empty again.
    await expect(section.getByTestId('cn-picked-photo')).toHaveCount(0);
    await expect(section.getByTestId('rev-photo-note')).toHaveValue('');

    // A note alone.
    await section.getByTestId('rev-photo-note').fill('Not done yet');
    await section.getByTestId('rev-photo-save').click();
    await expect(section.locator('[data-testid="rev-photo"][data-kind="note"]')).toContainText('Not done yet');

    // The room shows it, named by its wall.
    await page.getByTestId('rev-wall-back').click();
    const room = page.getByTestId('rev-room-photos');
    await expect(room.getByTestId('rev-photo')).toHaveCount(2);
    await expect(room.getByTestId('rev-photo').last()).toContainText('Drywall back off at the head');

    // A tap opens the viewer.
    await room.getByTestId('photo-open').click();
    await expect(page.getByTestId('file-viewer')).toBeVisible();
    await page.keyboard.press('Escape');

    // The architect reads them and adds none.
    await openAs(page, 'architect', '/p/job-s/revs/room-mock-room-110');
    await expect(page.getByTestId('rev-room-photos').getByTestId('rev-photo')).toHaveCount(2);
    await expect(page.getByTestId('rev-photo-box')).toHaveCount(0);
  });

  test('a photo and a note on a wall of a new request show on the request and on the wall', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The request opens in the right column of the desktop frame.');
    test.setTimeout(60_000);
    await openAs(page, 'sub', '/p/job-s/inspections/new?areas=mock-rev-area-2,mock-rev-area-1&items=');
    await page.getByTestId(`rev-item-${ITEM}`).click();
    await page.getByTestId('ir-special-required-no').click();
    await page.getByTestId('ir-submit').click();
    await page.getByTestId('ir-attest-confirm').click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
    const number = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').trim();

    // Right after filing: pick the wall, a photo and a note, Add.
    const photos = page.getByTestId('ir-wall-photos');
    await expect(photos.getByTestId('rev-photo-save')).toBeDisabled();
    await photos.getByTestId(`rev-photo-wall-${NORTH}`).click();
    await photos.getByTestId('rev-photo-input').setInputFiles(PHOTO);
    await expect(photos.getByTestId('cn-picked-photo')).toHaveCount(1);
    await photos.getByTestId('rev-photo-note').fill('Ready, all screws in');
    await photos.getByTestId('rev-photo-save').click();
    await expect(photos.getByTestId('rev-photo')).toHaveCount(1);
    await expect(photos.getByTestId('rev-photo')).toContainText('Ready, all screws in');

    // On the request.
    const id = number.replace('IR ', '');
    await page.goto(`/p/job-s/inspections/mock-ir-${id}`);
    await expect(page.getByTestId('ir-pane').getByTestId('ir-wall-photos').getByTestId('rev-photo')).toContainText('Ready, all screws in');

    // On the wall, with the request it was added on.
    await page.goto(`/p/job-s/revs/${NORTH}`);
    const wall = page.getByTestId('rev-wall-photos');
    await expect(wall.getByTestId('rev-photo')).toHaveCount(1);
    await expect(wall.getByTestId('rev-photo')).toContainText('Ready, all screws in');
    await expect(wall.getByTestId('rev-photo-request')).toHaveText(number);
  });
});
