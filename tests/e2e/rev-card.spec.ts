// A room's inspection card (migration 0101; Jesse, Oct 12: "here's the MPOE ... we're not gonna worry about that one,
// we'll track it with the exterior. For these two, what do we need? ... everything else should just go away") against
// the e2e mock (job-s, src/data/mock/revRooms.ts: room 205 Electrical holds its east wall, mock-rev-area-6, and the
// corridor's north wall, mock-rev-area-5, shared with room 210). A manager ('inspector') sets the card up on one
// screen: the corridor wall off (tracked with 210), two items picked; the room then shows only that wall and those two
// revs, and the request form from the room offers only those two items. Every state fills its whole box: a passed item
// is green. 'pm' reads (no Set up card), 'sub' asks.
// Test ids: rev-room-card (the room page's Set up card), rev-card-setup, rev-card-wall-<area>, rev-card-item-<item>,
// rev-card-rev-<rev number>, rev-card-save, rev-card-cancel; StateBox's data-state (passed, requested, failed, open, off).
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const EAST = 'mock-rev-area-6';
const CORRIDOR = 'mock-rev-area-5';
// HOW Beam Pockets (Rev 1) and First Side - First Layer (Rev 3).
const PICKED = ['mock-rev-item-1-3', 'mock-rev-item-3-1'];

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

/** As the manager: room 205's card, the corridor wall off, the two items picked, saved. */
async function setUpCard(page: Page): Promise<void> {
  await openAs(page, 'inspector', '/p/job-s/revs/room-mock-room-205');
  await page.getByTestId('rev-room-card').click();
  await expect(page).toHaveURL(/view=card/);
  const card = page.getByTestId('rev-card-setup');
  // The walls: both on; the items: none picked the first time.
  await expect(card.getByTestId(`rev-card-wall-${EAST}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByTestId(`rev-card-wall-${CORRIDOR}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByTestId('rev-card-item-mock-rev-item-0-1')).toHaveAttribute('aria-pressed', 'false');
  await card.getByTestId(`rev-card-wall-${CORRIDOR}`).click();
  await expect(card.getByTestId(`rev-card-wall-${CORRIDOR}`)).toHaveAttribute('data-state', 'off');
  for (const i of PICKED) await card.getByTestId(`rev-card-item-${i}`).click();
  for (const i of PICKED) await expect(card.getByTestId(`rev-card-item-${i}`)).toHaveAttribute('aria-pressed', 'true');
  await card.getByTestId('rev-card-save').click();
  await expect(page.getByText('Card saved.')).toBeVisible();
  await expect(page).not.toHaveURL(/view=card/);
}

test.describe('a room inspection card', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('set up with two items: the room and its request show only those', async ({ page }) => {
    await setUpCard(page);
    const room = page.getByTestId('rev-room-page');
    const walls = room.getByTestId('rev-room-walls');
    // The corridor wall left this room (it stays in 210); the east wall shows only the two revs it needs.
    await expect(walls.getByTestId(`rev-wall-${CORRIDOR}`)).toHaveCount(0);
    const strip = walls.getByTestId(`rev-wall-${EAST}`).getByTestId('rev-strip');
    await expect(strip.getByRole('button')).toHaveCount(2);
    await expect(strip.getByTestId('rev-chip-1')).toHaveText('HOW - Cavity');
    await expect(strip.getByTestId('rev-chip-3')).toHaveText('Drywall');

    // The wall's own page: only those two items.
    await openAs(page, 'pm', `/p/job-s/revs/${EAST}`);
    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-items').locator('[data-status]')).toHaveCount(2);
    await expect(wall.getByTestId('rev-items-off')).toHaveCount(0);

    // The request from the room (0113: Add for the whole room): only those two items, each on its one wall.
    await openAs(page, 'sub', '/p/job-s/revs/room-mock-room-205');
    await expect(page.getByTestId('rev-room-card')).toHaveCount(0);
    const whole = page.getByTestId('rev-room-whole');
    await expect(whole.getByRole('button')).toHaveCount(2);
    for (const i of PICKED) await expect(whole.getByTestId(`rev-room-add-${i}`)).toHaveAttribute('data-count', '1');
    await whole.getByTestId(`rev-room-add-${PICKED[0] ?? ''}`).click();
    await expect(whole.getByTestId(`rev-room-add-${PICKED[0] ?? ''}`)).toHaveAttribute('data-in', 'true');
  });

  test('Undo puts the card back as it was', async ({ page }) => {
    await setUpCard(page);
    await page.getByRole('button', { name: 'Undo' }).click();
    const walls = page.getByTestId('rev-room-page').getByTestId('rev-room-walls');
    await expect(walls.getByTestId(`rev-wall-${CORRIDOR}`)).toBeVisible();
    await expect(walls.getByTestId(`rev-wall-${EAST}`).getByTestId('rev-strip').getByRole('button')).toHaveCount(8);
  });

  test('a passed item is the whole box green, with a check', async ({ page }) => {
    await openAs(page, 'pm', '/p/job-s/revs/mock-rev-area-2');
    const plugs = page.getByTestId('rev-wall-page').getByTestId('rev-item-mock-rev-item-0-1');
    await expect(plugs).toHaveAttribute('data-state', 'passed');
    await expect(plugs).toHaveAttribute('style', /background: var\(--status-approved-solid\)/);
    await expect(plugs.locator('svg')).toHaveCount(1);
    // A failed one is the whole box red, an open one white with a strong edge.
    await expect(page.getByTestId('rev-wall-page').getByTestId('rev-item-mock-rev-item-1-2')).toHaveAttribute('style', /var\(--status-not_approved-solid\)/);
    await expect(page.getByTestId('rev-wall-page').getByTestId('rev-item-mock-rev-item-3-1')).toHaveAttribute('data-state', 'open');
  });
});
