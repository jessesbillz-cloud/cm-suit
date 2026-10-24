// A room's inspection card (migrations 0101, 0119; Jesse, Oct 23: "click what inspections we need to achieve, and save
// it. Then there should be some kind of lock on it so not everyone can edit it") against the e2e mock (job-s,
// src/data/mock/revRooms.ts: room 205 Electrical holds its east wall, mock-rev-area-6, and the corridor's north wall,
// mock-rev-area-5, whose CJ items are asked for on a request). A manager ('inspector') opens Setup: each box says its
// state in a word, a tap turns Needed into Not needed (marked changed, "1 change"), an asked-for box stays and says so,
// Save locks the card ("Locked by"), a locked card reads only until Unlock to edit, Cancel locks it again. 'pm' reads:
// no Set up card, the lock line only. Tap budget: one change saved in 3 taps from the room.
// Test ids: rev-room-card (the room page's Set up card), rev-card-setup (data-locked), rev-card-rev-<rev number>,
// rev-card-all-<item>, rev-card-box-<area>-<item> (data-state needed, not_needed, signed_off, asked_for, failed, some;
// data-changed), rev-card-bar, rev-card-changes, rev-card-save, rev-card-cancel, rev-card-unlock, rev-card-locked.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const EAST = 'mock-rev-area-6';
const CORRIDOR = 'mock-rev-area-5';
const TOW = 'mock-rev-item-0-1';
const CJ = 'mock-rev-item-2-1';
const ROOM = '/p/job-s/revs/room-mock-room-205';

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

/** As the manager: room 205's card, the east wall's TOW not needed, saved. */
async function saveOneChange(page: Page): Promise<void> {
  await openAs(page, 'inspector', ROOM);
  await page.getByTestId('rev-room-card').click();
  const card = page.getByTestId('rev-card-setup');
  const box = card.getByTestId(`rev-card-box-${EAST}-${TOW}`);
  await expect(box).toHaveAttribute('data-state', 'needed');
  await expect(box).toHaveText('Needed');
  await box.click();
  await expect(box).toHaveAttribute('data-state', 'not_needed');
  await expect(box).toHaveText('Not needed');
  await expect(box).toHaveAttribute('data-changed', 'true');
  await expect(card.getByTestId('rev-card-changes')).toHaveText('1 change');
  await card.getByTestId('rev-card-save').click();
  await expect(page.getByText('Card saved and locked.')).toBeVisible();
  await expect(page).not.toHaveURL(/view=card/);
}

test.describe('a room inspection card', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('every box says its state; an asked-for box stays; All walls does the item on every wall', async ({ page }) => {
    await openAs(page, 'inspector', `${ROOM}?view=card`);
    const card = page.getByTestId('rev-card-setup');
    await expect(card).toHaveAttribute('data-locked', 'false');
    const asked = card.getByTestId(`rev-card-box-${CORRIDOR}-${CJ}`);
    await expect(asked).toHaveAttribute('data-state', 'asked_for');
    await expect(asked).toHaveText('Asked for');
    await expect(asked).toHaveAttribute('style', /var\(--status-assigned-solid\)/);
    await asked.click();
    await expect(page.getByText(/^Asked for.*can't be removed$/)).toBeVisible();
    await expect(asked).toHaveAttribute('data-state', 'asked_for');
    await expect(card.getByTestId('rev-card-changes')).toHaveText('No changes');
    // A hand N/A on the east wall: Not needed, grey.
    await expect(card.getByTestId(`rev-card-box-${EAST}-mock-rev-item-4-2`)).toHaveAttribute('data-state', 'not_needed');

    const all = card.getByTestId(`rev-card-all-${TOW}`);
    await expect(all).toHaveText('Needed');
    await all.click();
    await expect(all).toHaveText('Not needed');
    await expect(card.getByTestId('rev-card-changes')).toHaveText('2 changes');
    await all.click();
    await expect(card.getByTestId('rev-card-changes')).toHaveText('No changes');
    // Nothing on the card is black.
    await expect(card.locator('[data-state].bg-ink')).toHaveCount(0);
  });

  test('saved, the card is locked; a reader sees the lock and no Setup', async ({ page }) => {
    await saveOneChange(page);
    const room = page.getByTestId('rev-room-page');
    await expect(room.getByTestId('rev-card-locked')).toContainText('Locked by Sample Inspector');
    const strip = room.getByTestId(`rev-wall-${EAST}`).getByTestId('rev-strip');
    await expect(strip.getByTestId('rev-chip-0')).toHaveCount(0);

    // Opened again: read only, Unlock to edit, and Cancel locks it again.
    await room.getByTestId('rev-room-card').click();
    const card = page.getByTestId('rev-card-setup');
    await expect(card).toHaveAttribute('data-locked', 'true');
    await expect(card.getByTestId(`rev-card-box-${EAST}-${TOW}`)).toBeDisabled();
    await expect(card.getByTestId('rev-card-save')).toHaveCount(0);
    await card.getByTestId('rev-card-unlock').click();
    await expect(card).toHaveAttribute('data-locked', 'false');
    await expect(card.getByTestId(`rev-card-box-${EAST}-${TOW}`)).toBeEnabled();
    await card.getByTestId('rev-card-cancel').click();
    await expect(page.getByTestId('rev-room-page').getByTestId('rev-card-locked')).toBeVisible();

    // A reader: the lock line, no Set up card, and no Setup by its address either.
    await openAs(page, 'pm', ROOM);
    await expect(page.getByTestId('rev-room-page').getByTestId('rev-card-locked')).toContainText('Locked by Sample Inspector');
    await expect(page.getByTestId('rev-room-card')).toHaveCount(0);
    await openAs(page, 'pm', `${ROOM}?view=card`);
    await expect(page.getByTestId('rev-room-page')).toBeVisible();
    await expect(page.getByTestId('rev-card-setup')).toHaveCount(0);
  });

  test('Undo puts the card back as it was, open', async ({ page }) => {
    await saveOneChange(page);
    await page.getByRole('button', { name: 'Undo' }).click();
    const room = page.getByTestId('rev-room-page');
    await expect(room.getByTestId('rev-card-locked')).toHaveCount(0);
    await expect(room.getByTestId(`rev-wall-${EAST}`).getByTestId('rev-strip').getByTestId('rev-chip-0')).toBeVisible();
  });

  test('tap budget: one box changed and saved in 3 taps from the room', async ({ page }) => {
    await openAs(page, 'inspector', ROOM);
    await expect(page.getByTestId('rev-room-card')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __taps: number }).__taps = 0;
      document.addEventListener('click', () => {
        (window as unknown as { __taps: number }).__taps += 1;
      }, true);
    });
    await page.getByTestId('rev-room-card').click();
    await page.getByTestId(`rev-card-box-${EAST}-${TOW}`).click();
    await page.getByTestId('rev-card-save').click();
    await expect(page.getByText('Card saved and locked.')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __taps: number }).__taps)).toBe(3);
  });

  test('a passed item is the whole box green, with a check', async ({ page }) => {
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-2');
    const plugs = page.getByTestId('rev-wall-page').getByTestId('rev-item-mock-rev-item-0-1');
    await expect(plugs).toHaveAttribute('data-state', 'passed');
    await expect(plugs).toHaveAttribute('style', /background: var\(--status-approved-solid\)/);
    await expect(plugs).toHaveAttribute('aria-label', /Signed off|Passed/);
    await expect(plugs.locator('svg')).toHaveCount(1);
    // A failed one is the whole box red, an open one white with a strong edge.
    await expect(page.getByTestId('rev-wall-page').getByTestId('rev-item-mock-rev-item-1-2')).toHaveAttribute('style', /var\(--status-not_approved-solid\)/);
    await expect(page.getByTestId('rev-wall-page').getByTestId('rev-item-mock-rev-item-3-1')).toHaveAttribute('data-state', 'open');
  });
});
