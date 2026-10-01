// Every list shows the whole title (Jesse, Sep 30; CLAUDE.md rule 15): a long name wraps inside its row, never cut off
// with "..." and never running past the row, on the desktop and on the phone. Contract with the mock: Sample Job A's
// Plans folder holds two long file names (one with no spaces at all), and RFI 003 has a long title
// (src/data/mock/fixtures.ts, src/data/mock/rfiSeeds.ts).
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const FILE_NAMES = [
  '211313_01.4_Fire Sprinkler System Design Package_Sample Co_Rev 2.pdf',
  'Sample_Level_2_Mechanical_Coordination_Drawing_Set_Rev_14_Combined_For_Review.pdf',
];
const RFI_TITLE = 'Sample storm drain connection at interim housing — invert conflicts with existing 8-inch line at grid C';

async function openAs(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('e2e-mock-user', 'pm');
  });
  await page.goto(path);
}

/** The text sits whole inside the row: every line of it within the row's box, and nothing cut with an ellipsis. */
async function wrapsInside(row: Locator, text: string): Promise<boolean> {
  return row.evaluate((el, t) => {
    const box = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let found = false;
    let inside = true;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue !== t) continue;
      found = true;
      const parent = node.parentElement;
      if (parent && getComputedStyle(parent).textOverflow === 'ellipsis') inside = false;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.left < box.left - 1 || line.right > box.right + 1) inside = false;
      }
    }
    return found && inside;
  }, text);
}

test.describe('long titles wrap, never cut off', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('files: a long file name shows whole inside its row', async ({ page }) => {
    await openAs(page, '/p/job-a/files');
    for (const name of FILE_NAMES) {
      const row = page.getByTestId('file-row').filter({ hasText: name });
      await expect(row.getByTestId('file-row-name')).toHaveText(name);
      expect(await wrapsInside(row, name), name).toBe(true);
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth), name).toBe(true);
    }
  });

  test('RFI log: a long title shows whole inside its row', async ({ page }) => {
    await openAs(page, '/p/job-a/rfis');
    const row = page.getByTestId(/^rfi-row-/).filter({ hasText: RFI_TITLE.slice(0, 40) });
    await expect(row).toContainText(RFI_TITLE);
    expect(await wrapsInside(row, RFI_TITLE)).toBe(true);
  });
});
