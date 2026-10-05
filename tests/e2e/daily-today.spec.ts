// Today's reports at the top of All my jobs (SPEC §13.1, My Daily Reports' home), against the e2e mock data layer: a
// card per job where I write dailies, its state today, one button to today's report there, and the job's calendar.
// Contract with the mock (data/mock/dailySetupSeeds): the mock user has daily setups on Sample Job A (the work log,
// every day, so today's report is due whatever day the test runs; no report yet, will be #1), Sample Job B and Sample
// School Wing (job-v, the VIS form), so the strip holds three cards, by job name.
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
// A tiny real image (the photo compressor decodes it), synthetic.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGNowAEYhpYEAILzYAGc7g8kAAAAAElFTkSuQmCC', 'base64');

function card(page: Page, projectId: string): Locator {
  return page.locator(`[data-testid="today-report"][data-project="${projectId}"]`);
}

test.describe("today's reports on All my jobs", () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test("Not started (yellow), Start opens today's report, then Submitted and Edit submitted", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await page.goto('/all/board');
    const a = card(page, 'job-a');
    await expect(a.getByTestId('today-report-status')).toHaveText('Not started');
    // Due is yellow (lib/status pending, SPEC §18.1 #9), never the postponed orange.
    await expect(a).toHaveAttribute('data-state', 'due');
    await expect(a.locator('span[aria-hidden]').first()).toHaveAttribute('style', /--status-pending-dot/);
    await expect(a.getByTestId('today-report-meta')).toHaveText('#1 · Every day');
    const action = a.getByTestId('today-report-action');
    await expect(action).toHaveText('Start');

    // At the top of the board, above Needs you.
    const strip = await page.getByTestId('today-reports').boundingBox();
    const needs = await page.getByRole('heading', { name: 'Needs you' }).boundingBox();
    expect(strip?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(needs?.y ?? Number.NEGATIVE_INFINITY);

    await action.click();
    await expect(page).toHaveURL(/\/p\/job-a\/dailies\/[^/?]+$/);
    const editor = page.getByTestId('daily-editor');
    await expect(editor).toContainText('will be #1');
    await editor.getByTestId('note-general').fill('Sample note for the day.');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
    await editor.getByTestId('daily-submit').click();
    await expect(page.getByTestId('daily-submitted')).toBeVisible();

    await page.goto('/all/board');
    await expect(a.getByTestId('today-report-status')).toHaveText('Submitted');
    await expect(a.getByTestId('today-report-meta')).toHaveText('#1 · Every day');
    await expect(action).toHaveText('Edit submitted');
    await action.click();
    await expect(page).toHaveURL(/\/p\/job-a\/dailies\/[^/?]+$/);
    await expect(page.getByTestId('daily-submitted')).toBeVisible();
  });

  test('the same words as Dailies: an untouched report is Start, one written in is Continue', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await page.goto('/all/board');
    await card(page, 'job-a').getByTestId('today-report-action').click();
    await expect(page).toHaveURL(/\/p\/job-a\/dailies\/[^/?]+$/);
    const reportUrl = page.url();
    await expect(page.getByTestId('daily-today')).toHaveText('Start');

    // Opened but untouched: still Not started and Start, here and in Dailies.
    await page.goto('/all/board');
    const a = card(page, 'job-a');
    await expect(a.getByTestId('today-report-status')).toHaveText('Not started');
    await expect(a.getByTestId('today-report-action')).toHaveText('Start');
    await a.getByTestId('today-report-action').click();
    await expect(page).toHaveURL(reportUrl);

    await page.getByTestId('daily-editor').getByTestId('note-general').fill('Sample note for the day.');
    await expect(page.getByTestId('daily-editor').getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByTestId('daily-today')).toHaveText('Continue');
    await expect(page.getByTestId('daily-today-chip')).toHaveText('Draft');
    await page.goto('/all/board');
    await expect(a.getByTestId('today-report-status')).toHaveText('Draft');
    await expect(a.getByTestId('today-report-action')).toHaveText('Continue');
    await a.getByTestId('today-report-action').click();
    await expect(page).toHaveURL(reportUrl);
  });

  test("phone width: the Today card's camera says when a photo lands on a submitted report", async ({ page }, testInfo) => {
    // The phone layout at phone width in Chromium (the photo compressor runs in the page).
    test.skip(testInfo.project.name !== 'desktop', 'Chromium at phone width.');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/p/job-a/dailies');
    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    // Field mode on the phone: the notes are there.
    await editor.getByTestId('note-general').fill('Sample note for the day.');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
    await editor.getByTestId('daily-submit').click();
    await expect(page.getByTestId('daily-submitted')).toBeVisible();

    await page.goto('/p/job-a/dailies');
    await expect(page.getByTestId('daily-today')).toHaveText('Edit submitted');
    await page.getByTestId('daily-quick-camera-camera-input').setInputFiles({ name: 'Sample photo.png', mimeType: 'image/png', buffer: PNG });
    const note = page.getByTestId('daily-today-resubmit');
    await expect(note).toContainText('Added to a submitted report.');
    await note.getByRole('button', { name: 'Update & resubmit' }).click();
    await expect(page.getByTestId('daily-submit')).toHaveText('Update & resubmit');
  });

  test('phone: the cards stack one to a row; the calendar button opens that job\'s calendar', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The phone layout.');
    await page.goto('/all/board');
    const cards = page.getByTestId('today-report');
    await expect(cards).toHaveCount(3);
    await expect
      .poll(() => cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-project'))))
      .toEqual(['job-a', 'job-b', 'job-v']);

    const boxes = await cards.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
      }),
    );
    boxes.slice(1).forEach((box, i) => {
      const above = boxes[i];
      expect(box.left, 'same column').toBe(above?.left);
      expect(box.width, 'same width').toBe(above?.width);
      expect(box.top, 'below the card above').toBeGreaterThanOrEqual(above?.bottom ?? Number.POSITIVE_INFINITY);
    });

    const action = card(page, 'job-a').getByTestId('today-report-action');
    const tap = await action.boundingBox();
    expect(tap?.height ?? 0, 'a full-size tap target').toBeGreaterThanOrEqual(44);

    await card(page, 'job-v').getByTestId('today-report-calendar').click();
    await expect(page).toHaveURL(/\/p\/job-v\/calendar$/);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'calendar');
  });
});
