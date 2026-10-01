// RFIs (the Sep 28 contract) against the e2e mock. The mock follows the database's rules: a sub writes and signs,
// the sample route on Sample Job A is one Inspector step, the PM signs and issues (the number comes only then), the
// architect answers, and the originator claims impact inside the window (amber row, permanent).
// Mock users: 'sub', 'inspector', 'pm', 'architect'. Sample Job A starts with RFIs 001-005, one waiting to issue, three
// in review (with the inspector, the PE, a consultant) and a draft (src/data/mock/rfiSeeds.ts). Test ids: rfi-new,
// rfi-title, rfi-question, rfi-send, rfi-row-<no>, rfi-strip (steps carry data-state done / current / todo),
// rfi-due-mark, rfi-status, rfi-label, rfi-holder, rfi-forward, rfi-issue, rfi-due, rfi-answer-open, rfi-answer-text,
// rfi-answer-send, rfi-answer, rfi-claim, rfi-impact-left, rfi-claim-cost, rfi-claim-confirm, rfi-impact-claimed,
// rfi-head-actions, rfi-history, rfi-search, needs-you-rfi.
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const TITLE = 'Sample beam pocket depth at grid 7';
/** A 1 x 1 PNG: a real image, so the photo compressor can read it. */
const PHOTO = {
  name: 'sample-photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
};

interface ClickWindow {
  __tapCount: number;
}

/** Switches the mock user and opens a page. The mock's data stays in this tab's sessionStorage. */
async function openAs(page: Page, who: string, path: string): Promise<void> {
  await page.evaluate((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto(path);
}

/** Signs in as a mock user and counts every click on the page (capture phase). */
async function installTapCounter(page: Page, user: string): Promise<void> {
  await page.addInitScript((who: string) => {
    window.localStorage.setItem('e2e-mock-user', who);
    (window as unknown as ClickWindow).__tapCount = 0;
    document.addEventListener('click', () => {
      (window as unknown as ClickWindow).__tapCount += 1;
    }, true);
  }, user);
}

async function resetTaps(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as ClickWindow).__tapCount = 0;
  });
}

function taps(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as ClickWindow).__tapCount);
}

async function tap(locator: Locator, counter: { n: number }): Promise<void> {
  await locator.click();
  counter.n += 1;
}

/** The cell of a log row's route strip for the step that has it now. */
function nowCell(row: Locator): Locator {
  return row.getByTestId('rfi-strip').locator('[data-state="current"]');
}

test.describe('RFIs', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('sign & send, the reviewer sends it on, the PM issues, the architect answers, the originator claims impact', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame; the phone gets its own test.');
    await page.goto('/');
    const right = page.getByTestId('right-column');
    const row = page.getByTestId(/^rfi-row-/).filter({ hasText: TITLE });

    // Sub: the only typing is the title and the question. Signed and sent, it goes to the inspector with no number yet.
    await openAs(page, 'sub', '/p/job-a/rfis');
    await page.getByTestId('rfi-new').click();
    await page.getByTestId('rfi-title').fill(TITLE);
    await page.getByTestId('rfi-question').fill('Sample question: the beam pocket is 8 in. deep on the plans and 10 in. on the shop drawing. Which applies?');
    await page.getByTestId('rfi-send').click();
    await expect(right.getByTestId('rfi-status')).toHaveText('In review');
    await expect(right.getByTestId('rfi-label')).toHaveText('Draft');
    await expect(row).toBeVisible();
    await expect(nowCell(row)).toContainText('Inspector');
    await expect(row.getByTestId('rfi-strip').locator('[data-state="done"]')).toHaveCount(1);

    // Inspector: it is theirs now; they send it on to issue.
    await openAs(page, 'inspector', '/p/job-a/rfis');
    await expect(nowCell(row)).toContainText('You');
    await row.click();
    await expect(right.getByTestId('rfi-holder')).toContainText('With you');
    await right.getByTestId('rfi-forward').click();
    await expect(right.getByTestId('rfi-status')).toHaveText('To issue');
    await expect(right.getByTestId('rfi-forward')).toHaveCount(0);
    await expect(nowCell(row)).toContainText('PM / PE');

    // PM: signs and issues; the database numbers it and the answer is due.
    await openAs(page, 'pm', '/p/job-a/rfis');
    await row.click();
    await right.getByTestId('rfi-issue').click();
    await expect(right.getByTestId('rfi-status')).toHaveText('Open');
    await expect(right.getByTestId('rfi-label')).toHaveText(/^RFI \d{3}$/);
    await expect(right.getByTestId('rfi-due')).toContainText('Due');
    await expect(nowCell(row)).toContainText('Architect');
    await expect(row.getByTestId('rfi-due-mark')).toContainText('Due');

    // Architect: answers in the app.
    await openAs(page, 'architect', '/p/job-a/rfis');
    await row.click();
    await right.getByTestId('rfi-answer-open').click();
    await right.getByTestId('rfi-answer-text').fill('Sample answer: 10 in. per the shop drawing.');
    await right.getByTestId('rfi-answer-send').click();
    await expect(right.getByTestId('rfi-status')).toHaveText('Answered');
    await expect(right.getByTestId('rfi-answer')).toContainText('10 in. per the shop drawing');
    await expect(row.getByTestId('rfi-strip').locator('[data-kind="answered"]')).toHaveAttribute('data-state', 'done');
    await expect(nowCell(row)).toHaveCount(0);

    // Sub: claims impact inside the window; the claim is on the RFI and its row is amber.
    await openAs(page, 'sub', '/p/job-a/rfis');
    await row.click();
    await expect(right.getByTestId('rfi-impact-left')).toContainText('days left');
    await right.getByTestId('rfi-claim').click();
    await right.getByTestId('rfi-claim-cost').check();
    await right.getByTestId('rfi-claim-confirm').click();
    await expect(right.getByTestId('rfi-impact-claimed')).toContainText('Impact claimed');
    await expect(right.getByTestId('rfi-claim')).toHaveCount(0);
    await expect(row).toHaveAttribute('data-impact', 'true');

    // History lives in the full view: the RFI alone in its own window, not the right column.
    await expect(right.getByTestId('rfi-history')).toHaveCount(0);
    const alone = new URL(page.url());
    alone.searchParams.set('window', '1');
    await page.goto(alone.toString());
    const history = page.getByTestId('rfi-history');
    for (const step of ['Signed & sent', 'Sent on', 'Signed & issued', 'Answered', 'Impact claimed']) await expect(history).toContainText(step);
  });

  test('each row shows where the RFI is and how long each person has had it; a tap shows the answer at once', async ({ page }, testInfo) => {
    await page.goto('/');
    await openAs(page, 'pm', '/p/job-a/rfis');
    // RFI 004: with the architect for 5 days, nobody has opened it. RFI 003: past its due date (red, never amber).
    const r4 = page.getByTestId('rfi-row-004');
    await expect(nowCell(r4)).toContainText('Architect');
    await expect(nowCell(r4)).toContainText('5d');
    await expect(r4.getByTestId('rfi-strip').locator('[data-state="done"]')).toHaveCount(3);
    await expect(page.getByTestId('rfi-row-003').getByTestId('rfi-due-mark')).toHaveAttribute('data-late', 'true');
    await expect(r4.getByTestId('rfi-due-mark')).not.toHaveAttribute('data-late', 'true');
    // The one sent on to a consultant: that person has it now.
    await expect(nowCell(page.getByTestId(/^rfi-row-/).filter({ hasText: 'rebar lap length' }))).toContainText('Engineer');
    // Long titles are whole: no ellipsis anywhere in the log.
    await expect(page.getByTestId(/^rfi-row-/).filter({ hasText: 'gridline C.4' })).toBeVisible();
    if (testInfo.project.name === 'phone') {
      // The strip fits the phone without scrolling sideways.
      const fits = await r4.getByTestId('rfi-strip').evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits).toBe(true);
    }

    // RFI 002 is answered: one tap, and the question and the architect's answer are both there.
    await page.getByTestId('rfi-row-002').click();
    await expect(page.getByTestId('rfi-question-text')).toContainText('Which governs?');
    await expect(page.getByTestId('rfi-answer')).toContainText('anchors at 16 in. on center');
    if (testInfo.project.name === 'desktop') {
      // The log stays put beside it, and the pane's header has exactly its three actions.
      await expect(page.getByTestId('rfi-row-004')).toBeVisible();
      await expect(page.getByTestId('right-column').getByTestId('rfi-head-actions').getByRole('button')).toHaveCount(3);
    }
  });

  test('late and not-opened RFIs sit at the top of Needs you and open where they live', async ({ page }) => {
    await page.goto('/');
    await openAs(page, 'pm', '/p/job-a/board');
    const waiting = page.getByTestId('needs-you-rfi');
    await expect(waiting.first()).toContainText('RFI 003');
    await expect(waiting.first()).toContainText('late');
    await expect(waiting.filter({ hasText: 'RFI 004' })).toContainText('Not opened');
    await waiting.first().click();
    await expect(page).toHaveURL(/\/p\/job-a\/rfis\/mock-rfi-job-a-3/);
    await expect(page.getByTestId('rfi-label')).toHaveText('RFI 003');
  });
});

test.describe('RFI tap budgets (SPEC §7.9)', () => {
  test.skip(!MOCK, 'Tap budgets run only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run them.');

  test('open an RFI by number = type the number + Enter', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The log search is the desktop budget.');
    await installTapCounter(page, 'pm');
    await page.goto('/p/job-a/rfis');
    const search = page.getByTestId('rfi-search');
    await expect(search).toBeVisible();
    await resetTaps(page);

    await search.fill('4');
    await search.press('Enter');

    await expect(page.getByTestId('right-column').getByTestId('rfi-label')).toHaveText('RFI 004');
    expect(await taps(page)).toBe(0);
  });

  test('phone: a new RFI with a photo = 3 taps after New RFI (typing is not counted)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone layout.');
    await installTapCounter(page, 'sub');
    await page.goto('/p/job-a/rfis');
    await page.getByTestId('rfi-new').click(); // the button itself is not counted
    await expect(page.getByTestId('rfi-title')).toBeVisible();
    await resetTaps(page);

    const counter = { n: 0 };
    const chooser = page.waitForEvent('filechooser');
    await tap(page.getByRole('button', { name: 'Camera' }), counter);
    await (await chooser).setFiles(PHOTO);
    await page.getByTestId('rfi-title').fill('Sample stair nosing detail');
    await page.getByTestId('rfi-question').fill('Sample question: which nosing profile applies at stair 3?');
    await expect(page.getByTestId('cn-picked-photo')).toHaveCount(1);
    await tap(page.getByTestId('rfi-send'), counter);

    await expect(page.getByTestId('rfi-status')).toHaveText('In review');
    await expect(page.getByRole('button', { name: /Download sample-photo/ })).toBeVisible();
    expect(counter.n).toBeLessThanOrEqual(3);
    // The page also counts Camera's own click on its hidden file input; still inside the budget.
    expect(await taps(page)).toBeLessThanOrEqual(3);
  });
});
