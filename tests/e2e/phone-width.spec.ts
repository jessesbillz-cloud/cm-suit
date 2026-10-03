// On a phone no page scrolls sideways: anything wider than the screen (an unwrapped title, a strip of route cells, a
// screen-reader label positioned outside its box) makes the whole page pan and pushes buttons out of reach. Checks
// the main screens of the sample job against the e2e mock.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

const PAGES = [
  '/p/job-a/board',
  '/p/job-a/rfis',
  '/p/job-a/rfis/mock-rfi-job-a-2',
  '/p/job-a/rfis/mock-rfi-job-a-2?window=1',
  '/p/job-a/files',
  '/p/job-a/inspections',
  '/p/job-a/dailies',
  '/p/job-a/calendar',
  '/p/job-s/revs',
  '/p/job-s/revs/mock-rev-area-2',
  '/p/job-s/revs?view=plan&level=Level%2002',
  '/p/job-a/safety',
  '/p/job-a/safety?view=library',
  '/p/job-a/safety/mock-meeting-1',
  '/p/job-a/safety/new',
  '/p/job-a/requirements',
  '/p/job-a/requirements?view=all&by=section',
  '/p/job-a/requirements?view=drafts',
  '/p/job-a/requirements/mock-req-ofci',
  '/p/job-a/requirements/new',
  '/p/job-a/requirements/read',
];

test.describe('phone width', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('no page is wider than the phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone only.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
    for (const path of PAGES) {
      await page.goto(path);
      // Loaded: something rendered and no loading spinner left (ui/States LoadingState is role=status).
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.locator('[role=status][aria-live=polite]')).toHaveCount(0);
      const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth }));
      expect(width.page, `${path} scrolls sideways`).toBeLessThanOrEqual(width.screen);
    }
  });
});
