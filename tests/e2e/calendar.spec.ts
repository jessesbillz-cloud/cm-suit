// Calendar (SPEC §7.6; MDR's schedule calendar) against the mock data layer. The month shows each day's inspections
// as banners; a day shows underneath with its requests by state, its other lines and the week's look-ahead; a request
// opens in the right column with the inspector's steps while the calendar stays; a person with calendar.manage adds a
// line from the day, sees it, deletes it and Undo brings it back; the type toggles hide and show a kind; the week view
// still lists the week. Runs on desktop and phone (the right column parts on desktop only).
// Contract with the mock: 'pm' manages the calendar and decides inspections on both sample jobs; the inspections mock
// seeds requests on every weekday around today on both jobs; the calendar mock has "Sample OAC meeting" on job-a on
// this week's Wednesday (meetings show by default). Days are the job's (America/Los_Angeles). The fire marshal's
// deputy ('ahj', on Sample Science Building) holds only the OFS pair: his calendar is the OFS requests sent to OFS
// (0061; the mock seeds IR 3 six days out, sent, and IR 4 eight days out, still with the inspector). Test ids:
// calendar, cal-day-<day>, cal-day-detail, cal-add-<day>, cal-title, cal-date, cal-save, cal-delete, cal-request,
// cal-others, cal-type-<kind>, cal-view-week, cal-subscribe, cal-subscribe-panel, cal-block-time, ir-pane.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

/** This week's day in the jobs' zone, Monday = 0 (the mock places its lines the same way). */
function thisWeek(offset: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + offset);
  return d.toISOString().slice(0, 10);
}

/** The day `n` days from today in the jobs' zone. */
function fromToday(n: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Special inspections are off in the default layout; turn them on (saved to the mock layout). */
async function showSpecials(page: Page): Promise<void> {
  const toggle = page.getByTestId('cal-type-special_inspections');
  if ((await toggle.getAttribute('aria-pressed')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

test.describe('calendar (SPEC §7.6)', () => {
  test.skip(!MOCK, 'Calendar e2e runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('add a line on the selected day, see it under the month, delete it and undo', async ({ page }) => {
    const wed = thisWeek(2);
    await page.goto(`/p/job-a/calendar?day=${wed}`);
    await expect(page.getByTestId('main-area')).toHaveAttribute('data-tool', 'calendar');
    await expect(page.getByTestId(`cal-day-${wed}`)).toHaveAttribute('aria-pressed', 'true');
    const detail = page.getByTestId('cal-day-detail');
    await expect(detail.getByTestId('cal-others')).toContainText('Sample OAC meeting');

    await page.getByTestId(`cal-add-${wed}`).click();
    await page.getByTestId('cal-title').fill('Sample crane day');
    await expect(page.getByTestId('cal-date')).toHaveValue(wed);
    await page.getByTestId('cal-save').click();
    await expect(detail).toContainText('Sample crane day');

    await detail.getByRole('button', { name: /Sample crane day/ }).click();
    await page.getByTestId('cal-delete').click();
    await expect(page.getByTestId('cal-day-detail')).not.toContainText('Sample crane day');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('cal-day-detail')).toContainText('Sample crane day');
  });

  test('tapping a day shows its requests underneath', async ({ page }) => {
    const wed = thisWeek(2);
    // A weekday in the same month as Wednesday (Tuesday, or Thursday when the month turns in between).
    const other = thisWeek(1).slice(0, 7) === wed.slice(0, 7) ? thisWeek(1) : thisWeek(3);
    await page.goto(`/all/calendar?day=${wed}`);
    await showSpecials(page);
    await page.getByTestId(`cal-day-${other}`).click();
    await expect(page).toHaveURL(new RegExp(`day=${other}`));
    await expect(page.getByTestId(`cal-day-${other}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`cal-day-${wed}`)).toHaveAttribute('aria-pressed', 'false');
    const detail = page.getByTestId('cal-day-detail');
    await expect(detail.getByTestId('cal-request').first()).toBeVisible();
    // All my jobs merges both jobs: each card names its job.
    await expect(detail.getByTestId('cal-request').filter({ hasText: 'Sample Job A' }).first()).toBeVisible();
    await expect(detail.getByTestId('cal-request').filter({ hasText: 'Sample Job B' }).first()).toBeVisible();
  });

  test('a request opens with the inspector\'s steps beside the calendar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    const wed = thisWeek(2);
    await page.goto(`/p/job-b/calendar?day=${wed}`);
    await showSpecials(page);
    const card = page.getByTestId('cal-day-detail').getByTestId('cal-request').first();
    await card.getByRole('button').first().click();
    await expect(page.getByTestId('ir-pane')).toBeVisible();
    await expect(page.getByTestId('calendar')).toBeVisible();
    await expect(page.getByTestId(`cal-day-${wed}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toHaveClass(/ring-accent/);
  });

  test("the deputy's calendar: the OFS requests sent to OFS, nothing still on its way, no blocked time", async ({ page }) => {
    // The GC team sees both requests; the one with OFS reads "With OFS" to them.
    await page.goto(`/p/job-s/calendar?day=${fromToday(6)}`);
    const detail = page.getByTestId('cal-day-detail');
    await expect(detail.getByTestId('cal-request')).toContainText('With OFS');
    await page.goto(`/p/job-s/calendar?day=${fromToday(8)}`);
    await expect(detail.getByTestId('cal-request')).toContainText('IR 4');

    // The deputy (a later init script wins): his own request reads Pending; the other one is not on his calendar.
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'ahj');
    });
    await page.goto(`/p/job-s/calendar?day=${fromToday(6)}`);
    await expect(detail.getByTestId('cal-request')).toContainText('IR 3');
    await expect(detail.getByTestId('cal-request')).toContainText('Pending');
    await expect(page.getByTestId('cal-block-time')).toHaveCount(0);
    await page.goto(`/p/job-s/calendar?day=${fromToday(8)}`);
    await expect(page.getByTestId(`cal-day-${fromToday(8)}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cal-day-title')).toBeVisible();
    await expect(detail.getByTestId('cal-request')).toHaveCount(0);
  });

  test('the type toggles hide and show a kind', async ({ page }) => {
    await page.goto(`/p/job-a/calendar?day=${thisWeek(2)}`);
    const meeting = page.getByTestId('cal-day-detail').getByText('Sample OAC meeting');
    await expect(meeting).toBeVisible();
    await page.getByTestId('cal-type-meetings').click();
    await expect(meeting).toHaveCount(0);
    await page.getByTestId('cal-type-meetings').click();
    await expect(meeting).toBeVisible();
  });

  test('the week view lists the week; Subscribe opens the feed link', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The phone shows the month.');
    const wed = thisWeek(2);
    await page.goto(`/p/job-a/calendar?view=week&day=${wed}`);
    await expect(page.getByTestId('cal-view-week')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId(`cal-day-${wed}`)).toContainText('Sample OAC meeting');
    await page.getByTestId('cal-subscribe').click();
    await expect(page.getByTestId('cal-subscribe-panel')).toBeVisible();
  });
});
