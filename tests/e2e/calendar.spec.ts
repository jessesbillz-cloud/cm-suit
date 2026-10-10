// Calendar (SPEC §7.6; MDR's schedule calendar; Jesse Oct 10) against the mock data layer. The month fits on one screen
// with a dot per item; a tapped day opens right under its week with its requests by state, its other lines and the
// week's look-ahead, and the same tap (or Back) closes it; a request opens in the right column with the inspector's
// steps while the calendar stays; a person with calendar.manage adds a
// line from the day, sees it, deletes it and Undo brings it back; the type toggles hide and show a kind; the week view
// still lists the week. Runs on desktop and phone (the right column parts on desktop only).
// Contract with the mock: 'pm' manages the calendar and decides inspections on both sample jobs; the inspections mock
// seeds requests on every weekday around today on both jobs; the calendar mock has "Sample OAC meeting" on job-a on
// this week's Wednesday (meetings show by default). Days are the job's (America/Los_Angeles). The fire marshal's
// deputy ('ahj', on Sample Science Building) holds only the OFS pair: his calendar is the OFS requests sent to OFS
// (0061; the mock seeds IR 3 six days out, sent, and IR 4 eight days out, still with the inspector). Deliveries: a
// Standby "Sample rebar delivery" on job-a this Tuesday, an ordinary "Sample drywall delivery" three days before this
// Monday, and the deliveries mock's own (mirrored as the database does): a Time TBD Sample Lumber one today. Job-a has
// blocked time today (weekly, noon to one). A bidder manages no job's calendar. Test ids: calendar, cal-month,
// cal-open, cal-day-<day>, cal-day-detail, cal-add-<day>, cal-title, cal-date, cal-save, cal-delete, cal-request, cal-others, cal-kind-<kind>,
// cal-line, cal-block, cal-type-<kind>, cal-view-week, cal-subscribe, cal-subscribe-panel, cal-block-time, ir-pane.
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

/** Whether the page (or the frame's scrolling main area) has to scroll to show what's on it. */
async function scrolls(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const main = document.querySelector('[data-testid="main-area"]');
    if (!main) throw new Error('No main area');
    const scroller = getComputedStyle(main).overflowY === 'visible' ? main.parentElement : main;
    if (!scroller) throw new Error('No scroller');
    const doc = document.documentElement;
    return scroller.scrollHeight > scroller.clientHeight + 1 || doc.scrollHeight > doc.clientHeight + 1;
  });
}

/** Whether the open day's row comes right after the week row that holds that day. */
async function openUnderWeekOf(page: Page, prefix: string, day: string): Promise<boolean> {
  return page.evaluate(
    ([p, d]) => {
      const open = document.querySelector(`[data-testid="${p}-open"]`);
      const cell = document.querySelector(`[data-testid="${p}-day-${d}"]`);
      return open !== null && cell !== null && open.previousElementSibling?.contains(cell) === true;
    },
    [prefix, day] as const,
  );
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
    // Nothing of his that day and nothing for him to add there: the day is only picked, nothing opens under it.
    await page.goto(`/p/job-s/calendar?day=${fromToday(8)}`);
    await expect(page.getByTestId(`cal-day-${fromToday(8)}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cal-request')).toHaveCount(0);
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

  test('deliveries read Standby or nothing, and Time TBD instead of All day', async ({ page }) => {
    const detail = page.getByTestId('cal-day-detail');
    await page.goto(`/p/job-a/calendar?day=${thisWeek(1)}`);
    await expect(detail.getByTestId('cal-line').filter({ hasText: 'Sample rebar delivery' })).toContainText('Standby');
    await page.goto(`/p/job-a/calendar?day=${thisWeek(-3)}`);
    const ordinary = detail.getByTestId('cal-line').filter({ hasText: 'Sample drywall delivery' });
    await expect(ordinary).toBeVisible();
    await expect(ordinary).not.toContainText('Confirmed');
    await page.goto(`/p/job-a/calendar?day=${fromToday(0)}`);
    const tbd = detail.getByTestId('cal-line').filter({ hasText: 'Sample Lumber' });
    await expect(tbd).toContainText('Time TBD');
    await expect(tbd).not.toContainText('All day');
  });

  test('the day lists its other lines under their kind, not "Other"', async ({ page }) => {
    await page.goto(`/p/job-a/calendar?day=${thisWeek(2)}`);
    const detail = page.getByTestId('cal-day-detail');
    await expect(detail.getByTestId('cal-kind-meetings')).toContainText('Meetings');
    await expect(detail.getByTestId('cal-kind-meetings')).toContainText('Sample OAC meeting');
    await expect(detail.getByRole('heading', { name: /^Other/ })).toHaveCount(0);
  });

  test('All my jobs: Add only for someone who may add lines on some job', async ({ page }) => {
    const today = fromToday(0);
    await page.goto('/all/calendar');
    // Today on "All my jobs" is this device's.
    await page.getByTestId('cal-today').click();
    await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/);
    await expect(page.locator('[data-testid^="cal-add-"]')).toBeVisible();
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'bidder');
    });
    await page.goto(`/all/calendar?day=${today}`);
    await expect(page.getByTestId(`cal-day-${today}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid^="cal-add-"]')).toHaveCount(0);
  });

  test('removed blocked time leaves at once; Undo brings it back', async ({ page }) => {
    await page.goto(`/p/job-a/calendar?day=${fromToday(0)}`);
    const block = page.getByTestId('cal-day-detail').getByTestId('cal-block');
    await expect(block).toHaveCount(1);
    await block.getByRole('button', { name: 'Remove blocked time' }).click();
    await expect(page.getByTestId('cal-day-detail').getByTestId('cal-block')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('cal-day-detail').getByTestId('cal-block')).toHaveCount(1);
  });

  test('the month fits on one screen; nothing is open until a day is tapped', async ({ page }) => {
    await page.goto('/p/job-a/calendar');
    await expect(page.getByTestId('cal-month')).toBeVisible();
    await expect(page.getByTestId('cal-mark').first()).toBeVisible();
    await expect(page.getByTestId('cal-open')).toHaveCount(0);
    expect(await scrolls(page)).toBe(false);
    // Every day of the month is on screen, the last one too.
    await expect(page.getByTestId('cal-month').locator('[data-testid^="cal-day-"]').last()).toBeInViewport();
  });

  test('a tapped day opens right under its week; the same tap closes it; Back closes it too', async ({ page }) => {
    const wed = thisWeek(2);
    await page.goto(`/p/job-a/calendar?at=${wed}`);
    const day = page.getByTestId(`cal-day-${wed}`);
    await day.click();
    await expect(page).toHaveURL(new RegExp(`day=${wed}`));
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    const open = page.getByTestId('cal-open');
    await expect(open.getByTestId('cal-others')).toContainText('Sample OAC meeting');
    expect(await openUnderWeekOf(page, 'cal', wed)).toBe(true);

    // The same day again closes it; the month stays.
    await day.click();
    await expect(open).toHaveCount(0);
    await expect(day).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId(`cal-day-${wed}`)).toBeVisible();

    // Open it again, open the meeting (beside it, or full screen on a phone); Back, Back: the day closes.
    await day.click();
    await open.getByRole('button', { name: /Sample OAC meeting/ }).click();
    await expect(page).toHaveURL(/\/calendar\/[^?]+\?/);
    await page.goBack();
    await expect(page.getByTestId('cal-open')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('cal-open')).toHaveCount(0);
    await expect(page.getByTestId(`cal-day-${wed}`)).toHaveAttribute('aria-pressed', 'false');
  });
});

// The Inspections tool's month is the same calendar (ui/MonthCalendar): its bookings under the tapped day.
test.describe('inspections month (Jesse Oct 10)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('fits on one screen; a tapped day opens its requests under its week; a request opens; Back closes', async ({ page }) => {
    const wed = thisWeek(2);
    await page.goto(`/p/job-a/inspections?view=month&at=${wed}`);
    await expect(page.getByTestId('ir-view-month')).toHaveAttribute('aria-selected', 'true');
    const day = page.getByTestId(`ir-day-${wed}`);
    await expect(day.getByTestId('ir-mark').first()).toBeVisible();
    await expect(page.getByTestId('ir-open')).toHaveCount(0);
    expect(await scrolls(page)).toBe(false);

    await day.click();
    await expect(page).toHaveURL(new RegExp(`day=${wed}`));
    const openRow = page.getByTestId('ir-open');
    await expect(openRow.getByTestId('ir-entry').first()).toBeVisible();
    expect(await openUnderWeekOf(page, 'ir', wed)).toBe(true);

    // A request opens as it always has (beside the month, or full screen on a phone); Back, Back: the day closes.
    await openRow.locator('button[data-testid="ir-entry"]').first().click();
    await expect(page.getByTestId('ir-pane')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('ir-open')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('ir-open')).toHaveCount(0);

    // The same tap opens and closes it.
    await day.click();
    await expect(openRow).toBeVisible();
    await day.click();
    await expect(openRow).toHaveCount(0);
    await expect(day).toHaveAttribute('aria-pressed', 'false');
  });

  test('a link from before the month (?view=week) opens the month', async ({ page }) => {
    await page.goto('/p/job-a/inspections?view=week');
    await expect(page.getByTestId('ir-month')).toBeVisible();
  });
});
