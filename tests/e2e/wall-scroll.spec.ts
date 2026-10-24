// One scroll on a wall's page (Jesse, Oct 23, 18:51: "I don't like the double scrolling we've got going on. Shrink the
// wall down so it all fits on one screen at the top, and then if I've got to scroll down underneath for the different
// revs, that's fine."): on a desktop, an iPad and an iPhone the page is the one thing that scrolls; nothing is held in
// place; the 3-D wall, the top line and the first row of items are on the first screen, and the drawing still takes a
// tap. A tap on an item far down brings the drawing back. The room page and the request's Review scroll once too.
// Pictures of each size go to test-results/look (the look-screenshots artifact). Runs against the e2e mock (job-s):
// Corridor 110's north wall (mock-rev-area-2) has its items in eight revs; 'pm' files OFS requests.
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const WALL = '/p/job-s/revs/mock-rev-area-2';

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

/**
 * What scrolls for this screen: every element holding it or inside it with a scroll bar that has somewhere to go, and
 * the page itself. The docked panel beside it (the board) is its own content and is not counted.
 */
async function scrollersOf(screen: Locator): Promise<string[]> {
  return screen.evaluate((root) => {
    const found: string[] = [];
    const scrolls = (el: Element) => {
      const y = getComputedStyle(el).overflowY;
      return (y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    };
    const name = (el: Element) => el.getAttribute('data-testid') ?? el.tagName.toLowerCase();
    for (let el = root.parentElement; el !== null; el = el.parentElement) if (scrolls(el)) found.push(name(el));
    for (const el of Array.from(root.querySelectorAll('*'))) if (scrolls(el)) found.push(name(el));
    if (scrolls(root)) found.push(name(root));
    const doc = document.scrollingElement;
    if (doc !== null && doc.scrollHeight > doc.clientHeight + 1 && !found.includes('html')) found.push('page');
    return found;
  });
}

/** The box is wholly on the first screen. */
async function onFirstScreen(page: Page, el: Locator): Promise<void> {
  const box = await el.boundingBox();
  const h = page.viewportSize()?.height ?? 0;
  expect(box, 'it has a box').not.toBeNull();
  if (box === null) return;
  expect(box.y, 'its top is on screen').toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, 'its bottom is on screen').toBeLessThanOrEqual(h + 0.5);
}

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'ipad', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
] as const;

async function checkWall(page: Page, shot: string): Promise<void> {
  const wall = page.getByTestId('rev-wall-page');
  const drawing = wall.getByTestId('rev-wall-3d');
  await expect(drawing).toBeVisible();
  await expect(page.locator('[role=status][aria-live=polite]')).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // The first screen: the top line, the whole drawing and the first row of items.
  await onFirstScreen(page, wall.getByTestId('rev-wall-top'));
  await onFirstScreen(page, drawing);
  await onFirstScreen(page, wall.getByTestId('rev-item').first().getByRole('button').first());
  await page.screenshot({ path: `test-results/look/wall-${shot}.png` });
  // Exactly one scroller, and nothing held in place over the items.
  expect(await scrollersOf(wall)).toHaveLength(1);
  const held = await wall.evaluate((root) => Array.from(root.querySelectorAll('*')).filter((el) => getComputedStyle(el).position === 'sticky').length);
  expect(held).toBe(0);
  // The drawing still takes a tap.
  await drawing.locator('[data-part="box"]').click();
  await expect(drawing).toHaveAttribute('data-focus', 'box');
  await expect(drawing.getByTestId('wall3d-label')).toHaveText('BOX Caulking');
}

test.describe('a wall page scrolls once', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  for (const size of SIZES) {
    test(`${size.name}: the wall on the first screen, one scroll`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'The desktop frame at each size; the phone has its own test.');
      await page.setViewportSize({ width: size.width, height: size.height });
      await openAs(page, 'pm', WALL);
      await checkWall(page, size.name);
    });
  }

  test('iPhone: the wall on the first screen, one scroll; a tap far down brings the drawing back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone only.');
    await openAs(page, 'pm', WALL);
    await checkWall(page, 'iphone');
    const wall = page.getByTestId('rev-wall-page');
    const drawing = wall.getByTestId('rev-wall-3d');
    await wall.getByTestId('rev-item-mock-rev-item-7-1').click();
    await expect(drawing).toHaveAttribute('data-focus', 'whole_wall');
    await expect(drawing).toBeInViewport({ ratio: 0.9 });
  });

  test('the room page and the request Review scroll once', async ({ page }) => {
    await openAs(page, 'pm', '/p/job-s/revs/room-mock-room-110');
    const room = page.getByTestId('rev-room-page');
    await expect(room).toBeVisible();
    expect((await scrollersOf(room)).length).toBeLessThanOrEqual(1);

    await openAs(page, 'pm', WALL);
    const wall = page.getByTestId('rev-wall-page');
    for (const id of ['3-1', '1-2']) await wall.getByTestId(`rev-add-mock-rev-item-${id}`).click();
    await expect(page.getByTestId('basket-line')).toHaveText('2 items on 1 wall');
    await page.getByTestId('basket-review').click();
    const group = page.getByTestId('basket-group').first();
    await expect(group).toBeVisible();
    expect((await scrollersOf(group)).length).toBeLessThanOrEqual(1);
  });
});
