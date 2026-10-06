// The frame on a desktop (SPEC §7.2; audit Oct 4, Jesse: "opened things were not centered on the desktop"). Every tool
// has the same width, so the left edge never jumps between tools; a line of the board docked beside another tool opens
// in the right column without leaving that tool, and Close brings the board back; every opened item has Open in new
// window; More offers only the tools the role may read. Runs against the e2e mock.
// Contract with the mock: 'pm' on job-a has the board lines "Sample Plan Set A.pdf was added to Plans" and "Delivery #3:
// Sample Steel Co"; 'bidder' on job-a reads only the board and Bids (my_readable_tools, 0081). Test ids: main-area
// (data-tool), tool-width, right-column (data-full), right-full (Full screen / Back), board-line, board-item, item-open-window, daily-today, daily-editor, rail-more,
// rail-more-menu, rail-more-<tool>, phone-tab-more, phone-more-<tool>.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function signIn(page: Page, who: string): Promise<void> {
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
}

/** The tool's own container: its rendered width and left edge on the page. */
async function toolBox(page: Page): Promise<{ x: number; width: number; max: string }> {
  const box = page.getByTestId('tool-width');
  await expect(box).toBeVisible();
  const rect = await box.boundingBox();
  const max = await box.evaluate((el) => getComputedStyle(el).maxWidth);
  return { x: Math.round(rect?.x ?? -1), width: Math.round(rect?.width ?? -1), max };
}

test.describe('the frame on a desktop', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('Files and the Board share one width: the left edge stays put between tools', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The desktop frame.');
    await signIn(page, 'pm');
    await page.setViewportSize({ width: 2400, height: 1000 });
    await page.goto('/p/job-a/files');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
    const files = await toolBox(page);
    await page.goto('/p/job-a/board');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'board');
    const board = await toolBox(page);
    expect(files.max).not.toBe('none');
    expect(board.max).toBe(files.max);
    expect(board.x).toBe(files.x);
    expect(board.width).toBe(files.width);
    // On a wide screen the right column grows (420px, wider from 1600px).
    const right = await page.getByTestId('right-column').boundingBox();
    expect(right?.width ?? 0).toBeGreaterThan(420);
  });

  test('a docked board line opens beside the tool I am in; Close brings the board back and keeps the tool', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The docked board is the desktop frame.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/files');
    const right = page.getByTestId('right-column');
    await right.getByTestId('board-line').filter({ hasText: 'Delivery #3: Sample Steel Co' }).click();
    await expect(right.getByTestId('board-item')).toBeVisible();
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
    await expect(page).toHaveURL(/\/p\/job-a\/files\/board\./);

    await right.getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/p\/job-a\/files$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
    await expect(right.getByTestId('board-line').first()).toBeVisible();
  });

  test('Full screen turns into Back, and Back (or Escape) returns to the tool as it was', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The right column is the desktop frame.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/files');
    const right = page.getByTestId('right-column');
    await right.getByTestId('board-line').filter({ hasText: 'Delivery #3: Sample Steel Co' }).click();
    await expect(right.getByTestId('board-item')).toBeVisible();
    const full = right.getByTestId('right-full');
    await expect(full).toHaveText('Full screen');
    await full.click();
    await expect(right).toHaveAttribute('data-full', 'true');
    await expect(page.getByTestId('main-area')).toBeHidden();
    await expect(full).toHaveText('Back');
    await full.click();
    await expect(right).toHaveAttribute('data-full', 'false');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'files');
    await expect(page.getByTestId('main-area')).toBeVisible();
    await full.click();
    await expect(right).toHaveAttribute('data-full', 'true');
    await page.keyboard.press('Escape');
    await expect(right).toHaveAttribute('data-full', 'false');
    await expect(right.getByTestId('board-item')).toBeVisible();
  });

  test('a daily report has Open in new window', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A phone has no windows.');
    await signIn(page, 'pm');
    await page.goto('/p/job-a/dailies');
    await page.getByTestId('daily-today').click();
    await expect(page.getByTestId('daily-editor')).toBeVisible();
    const right = page.getByTestId('right-column');
    // The column says what the item is, not the tool's name.
    await expect(right.getByTestId('right-column-title')).toHaveText('Daily report');
    const opened = page.context().waitForEvent('page');
    await right.getByTestId('item-open-window').click();
    const win = await opened;
    await win.waitForLoadState();
    await expect(win).toHaveURL(/\/p\/job-a\/dailies\/[^/?]+\?window=/);
  });
});

test.describe('More by role', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a bidder is offered only what a bidder may open', async ({ page, isMobile }) => {
    await signIn(page, 'bidder');
    await page.goto('/p/job-a/bids');
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'bids');
    if (isMobile) {
      await expect(page.getByTestId('phone-tab-dailies')).toHaveCount(0);
      const more = page.getByTestId('phone-tab-more');
      if ((await more.count()) > 0) {
        await more.click();
        await expect(page.getByTestId('phone-more-dailies')).toHaveCount(0);
        await expect(page.getByTestId('phone-more-files')).toHaveCount(0);
      }
      return;
    }
    await expect(page.getByTestId('rail-dailies')).toHaveCount(0);
    await expect(page.getByTestId('rail-files')).toHaveCount(0);
    await page.getByTestId('rail-more').click();
    const menu = page.getByTestId('rail-more-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(1);
    await expect(menu.getByTestId('rail-more-board')).toBeVisible();
  });
});
