// The request being built (migration 0113; Jesse, Oct 23: "they just walk up to the wall, look at it and say OK, I want
// to get the top of wall inspected on this one - click the button - and that gets added to the inspection request ...
// and there should be a way to do top of wall for the entire room") against the e2e mock (job-s, Sample Science
// Building: src/data/mock/revSeeds.ts and revRooms.ts). Level 02 room 205 Electrical holds its east wall
// (mock-rev-area-6) and the corridor's north wall (mock-rev-area-5), both on page 2 of the plan set; Level 01 room 110
// holds the corridor's north wall (mock-rev-area-2, its HOW cavity spray failed) and the shaftwall (spray passed).
// TOW speed plugs (mock-rev-item-0-1) passed on Level 01 only; HOW cavity spray is mock-rev-item-1-2.
// Test ids: rev-add-<item> (data-in), rev-room-add-<item> (data-count, data-in), basket-bar (data-count), basket-line,
// basket-review, basket-group (data-item), basket-wall-<area>, basket-facts, basket-remove, basket-ofs-number,
// basket-send, basket-sent (data-count), basket-sent-request, ofs-batch (data-size), rev-add-wall, field-level-<level>,
// field-room-<id|new>, field-room-number, field-room-name, field-side-<side>, field-tag, field-save, rev-field-check,
// rev-field-confirm.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const TOW = 'mock-rev-item-0-1';
const SPRAY = 'mock-rev-item-1-2';

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

/** Today on the job's clock (Pacific time), as the date field takes it. */
function jobToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** The first Monday to Friday after a day. */
function nextWorkingDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

test.describe('the request being built', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('walk two walls adding top of wall, cavity spray for whole rooms, review, send: one batch on the start page and the schedule', async ({ page }) => {
    test.setTimeout(90_000);
    // The inspector files it himself (his own OFS requests go straight to OFS, on his one statement).
    await openAs(page, 'inspector', '/p/job-s/revs?level=Level%2002');
    await page.getByTestId('rev-room-mock-room-205').click();
    const room = page.getByTestId('rev-room-page');

    // Wall one: the east wall, top of wall.
    await room.getByTestId('rev-room-walls').getByTestId('rev-wall-mock-rev-area-6').getByTestId('rev-wall-open').click();
    await page.getByTestId('rev-wall-page').getByTestId(`rev-add-${TOW}`).click();
    await expect(page.getByTestId(`rev-add-${TOW}`)).toHaveAttribute('data-in', 'true');
    await expect(page.getByTestId('basket-line')).toHaveText('1 item on 1 wall');
    // Wall two: the corridor's north wall, the other side of the room.
    await page.getByTestId('rev-wall-back').click();
    await room.getByTestId('rev-room-walls').getByTestId('rev-wall-mock-rev-area-5').getByTestId('rev-wall-open').click();
    await page.getByTestId('rev-wall-page').getByTestId(`rev-add-${TOW}`).click();
    await expect(page.getByTestId('basket-line')).toHaveText('2 items on 2 walls');

    // Cavity spray for the whole room: both walls at once; top of wall is in already.
    await page.getByTestId('rev-wall-back').click();
    await expect(page.getByTestId(`rev-room-add-${TOW}`)).toHaveAttribute('data-in', 'true');
    await expect(page.getByTestId(`rev-room-add-${SPRAY}`)).toHaveAttribute('data-count', '2');
    await page.getByTestId(`rev-room-add-${SPRAY}`).click();
    await expect(page.getByTestId('basket-line')).toHaveText('4 items on 2 walls');
    // And for room 110 on Level 01: only the corridor wall, whose spray failed (the shaftwall's passed).
    await openAs(page, 'inspector', '/p/job-s/revs/room-mock-room-110');
    await expect(page.getByTestId(`rev-room-add-${SPRAY}`)).toHaveAttribute('data-count', '1');
    await page.getByTestId(`rev-room-add-${SPRAY}`).click();
    await expect(page.getByTestId('basket-bar')).toHaveAttribute('data-count', '5');

    // Review: one OFS request per item and sheet page (spray on Level 02's page and on Level 01's), numbers in turn.
    await page.getByTestId('basket-review').click();
    const groups = page.getByTestId('basket-group');
    await expect(groups).toHaveCount(3);
    await expect(groups.nth(0)).toHaveAttribute('data-item', TOW);
    await expect(groups.nth(0).getByTestId('basket-wall-mock-rev-area-6')).toContainText('205 Electrical');
    await expect(groups.nth(0).getByTestId('basket-facts').first()).toHaveText('UL —');
    const numbers = page.getByTestId('basket-ofs-number');
    await expect(numbers).toHaveCount(3);
    const first = Number(await numbers.nth(0).inputValue());
    await expect(numbers.nth(1)).toHaveValue(String(first + 1));
    await expect(numbers.nth(2)).toHaveValue(String(first + 2));

    await page.getByTestId('ir-special-required-no').click();
    await page.getByTestId('ir-inspector-ack').check();
    await page.getByTestId('basket-send').click();
    const sent = page.getByTestId('basket-sent');
    await expect(sent).toHaveAttribute('data-count', '3');
    await expect(sent).toContainText('Batch of 3');
    await page.getByTestId('basket-back').click();
    await expect(page.getByTestId('basket-bar')).toHaveCount(0);

    // The start page: the three together under Waiting on OFS > Inspections.
    await page.goto('/p/job-s/board');
    await page.locator('[data-testid="ofs-group"][data-group="waiting"]').getByTestId('ofs-group-head').first().click();
    await page.locator('[data-testid="ofs-group"][data-group="waiting/inspections"]').getByTestId('ofs-group-head').click();
    const batch = page.getByTestId('ofs-desk').getByTestId('ofs-batch');
    await expect(batch).toHaveAttribute('data-size', '3');
    await expect(batch.getByTestId('ofs-desk-row')).toHaveCount(3);

    // The fire marshal's schedule: no time asked, so under Needs a time, together.
    await openAs(page, 'ahj', `/p/job-s/inspections?view=week&day=${nextWorkingDay(jobToday())}`);
    await expect(page.getByTestId('ofs-needs-time').getByTestId('ofs-batch')).toHaveAttribute('data-size', '3');
  });

  test('a wall added on the spot opens on its 3-D page and goes in the request; a manager checks it', async ({ page }) => {
    test.setTimeout(60_000);
    await openAs(page, 'sub', '/p/job-s/revs?level=Level%2002');
    await page.getByTestId('rev-add-wall').click();
    await page.getByTestId('field-level-Level 02').click();
    await expect(page.getByTestId('field-room-new')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('field-room-number').fill('0302');
    await page.getByTestId('field-room-name').fill('Classroom');
    await page.getByTestId('field-side-north').click();
    await page.getByTestId('field-save').click();

    const wall = page.getByTestId('rev-wall-page');
    await expect(wall.getByTestId('rev-wall-name')).toHaveText('0302 Classroom north wall');
    await expect(wall.getByTestId('rev-wall-3d')).toBeVisible();
    await wall.getByTestId(`rev-add-${TOW}`).click();
    await expect(page.getByTestId('basket-line')).toHaveText('1 item on 1 wall');
    // The sub doesn't check walls.
    await expect(wall.getByTestId('rev-field-check')).toHaveCount(0);
    const url = page.url();

    // The inspector: added by the sub, to check; Confirm clears it.
    await openAs(page, 'inspector', new URL(url).pathname);
    const check = page.getByTestId('rev-field-check');
    await expect(check).toContainText('needs check');
    await check.getByTestId('rev-field-confirm').click();
    await expect(page.getByTestId('rev-field-check')).toHaveCount(0);
  });
});
