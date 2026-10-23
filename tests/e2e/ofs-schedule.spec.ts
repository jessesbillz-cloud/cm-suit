// OFS scheduling (0108; Jesse, Oct 22: the texts move into the app) against the e2e mock (job-s, Sample Science
// Building). The fire marshal's week is his schedule: a Flexible request waits under Needs a time, a timed one on its
// day. He confirms one and picks another time for the other; the requester accepts it in one tap; both show Confirmed
// on his schedule, and his home leads with it. Mock users: 'sub' asks, 'pm' is the GC, 'inspector' sends, 'ahj' is
// the fire marshal. Test ids: ofs-schedule, ofs-needs-time, ofs-box-<id> (data-state), ofs-propose-open, ofs-propose
// (-date, -time, -note, -send), ofs-sched (data-state), ofs-sched-line, ofs-sched-accept, home-ofs-schedule.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
/** The seeded OFS request two days out at 9:00 (the sub's), still with the inspector. */
const SEEDED = 'mock-ir-revs-7';

async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  try {
    await page.goto(path);
  } catch (e) {
    if (!String(e).includes('interrupted by another navigation')) throw e;
    await page.waitForLoadState();
    await page.goto(path);
  }
}

/** A day on the job's clock (Pacific time), n days from today, as the date field takes it. */
function jobDay(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** The sub's OFS request, Flexible, today, sent with the question answered No. Answers its IR number. */
async function subAsks(page: Page): Promise<string> {
  await page.goto('/p/job-s/inspections/new?areas=mock-rev-area-4&items=mock-rev-item-3-1');
  await expect(page.getByTestId('rev-picker')).toBeVisible();
  await page.getByTestId('ir-date').fill(jobDay(0));
  await page.getByTestId('ir-special-required-no').click();
  await page.getByTestId('ir-submit').click();
  await page.getByTestId('ir-attest-confirm').click();
  await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
  return ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');
}

/** The GC checks it Ready (when it waits on the GC), then the inspector sends it to OFS. */
async function toOfs(page: Page, id: string, gc: boolean): Promise<void> {
  if (gc) {
    await openAs(page, 'pm', `/p/job-s/inspections/${id}`);
    await page.getByTestId('ofs-gc-check').click();
    await expect(page.getByTestId('ir-gc')).toHaveCount(0);
  }
  await openAs(page, 'inspector', `/p/job-s/inspections/${id}`);
  await page.getByTestId('ir-send-ofs').click();
  await expect(page.getByTestId('ir-with-ofs')).toBeVisible();
}

test.describe('OFS scheduling', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'sub');
    });
  });

  test('the fire marshal confirms one and picks another time for the other; the requester accepts', async ({ page }) => {
    test.setTimeout(90_000);
    const n = await subAsks(page);
    const flexible = `mock-ir-${n}`;
    await toOfs(page, flexible, true);
    await toOfs(page, SEEDED, false);

    // His week is his schedule: the Flexible one needs a time, the seeded one sits on its day, both Asked.
    await openAs(page, 'ahj', `/p/job-s/inspections?view=week&day=${jobDay(2)}`);
    const schedule = page.getByTestId('ofs-schedule');
    await expect(schedule.getByTestId('ofs-needs-time').getByTestId(`ofs-box-${flexible}`)).toHaveAttribute('data-state', 'asked');
    const seeded = schedule.getByTestId(`ir-day-${jobDay(2)}`).getByTestId(`ofs-box-${SEEDED}`);
    await expect(seeded).toHaveAttribute('data-state', 'asked');
    await expect(seeded).toContainText('OFS IR #0007');
    await expect(seeded).toContainText('Sample Sub');

    // Confirm the asked time: one tap on the request.
    await seeded.click();
    const pane = page.getByTestId('ir-pane');
    await pane.getByTestId('ir-confirm').click();
    await expect(pane.getByTestId('ofs-sched')).toHaveAttribute('data-state', 'confirmed');
    await expect(seeded).toHaveAttribute('data-state', 'confirmed');

    // Pick another time for the Flexible one, with a short note.
    await schedule.getByTestId(`ofs-box-${flexible}`).click();
    await pane.getByTestId('ofs-propose-open').click();
    await pane.getByTestId('ofs-propose-date').fill(jobDay(3));
    await pane.getByTestId('ofs-propose-time').selectOption('13:00');
    await pane.getByTestId('ofs-propose-note').fill('Sample: mornings are full');
    await pane.getByTestId('ofs-propose-send').click();
    await expect(pane.getByTestId('ofs-sched')).toHaveAttribute('data-state', 'proposed');
    await expect(pane.getByTestId('ofs-sched-line')).toContainText('OFS proposed');
    await expect(pane.getByTestId('ofs-sched-line')).toContainText('1:00 PM');
    await expect(pane.getByTestId('ofs-sched-accept')).toHaveCount(0);
    await expect(schedule.getByTestId('ofs-needs-time')).toHaveCount(0);

    // The requester: one clear box, and Accept.
    await openAs(page, 'sub', `/p/job-s/inspections/${flexible}`);
    await expect(pane.getByTestId('ofs-sched')).toHaveAttribute('data-state', 'proposed');
    await expect(pane.getByTestId('ofs-sched-line')).toContainText('Sample: mornings are full');
    await pane.getByTestId('ofs-sched-accept').click();
    await expect(pane.getByTestId('ofs-sched')).toHaveAttribute('data-state', 'confirmed');
    await expect(pane.getByTestId('ofs-sched-line')).toContainText('Confirmed for');
    await openAs(page, 'sub', `/p/job-s/inspections/${SEEDED}`);
    await expect(pane.getByTestId('ofs-sched-line')).toContainText('Confirmed for');

    // Both read Confirmed on his schedule, each on its day; his home leads with the schedule.
    await openAs(page, 'ahj', `/p/job-s/inspections?view=week&day=${jobDay(3)}`);
    await expect(schedule.getByTestId(`ir-day-${jobDay(3)}`).getByTestId(`ofs-box-${flexible}`)).toHaveAttribute('data-state', 'confirmed');
    await page.goto(`/p/job-s/inspections?view=week&day=${jobDay(2)}`);
    await expect(schedule.getByTestId(`ir-day-${jobDay(2)}`).getByTestId(`ofs-box-${SEEDED}`)).toHaveAttribute('data-state', 'confirmed');
    await page.goto('/all/board');
    await expect(page.getByTestId('home-ofs-schedule').getByTestId('ofs-schedule')).toBeVisible();
  });
});
