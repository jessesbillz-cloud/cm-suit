// Dailies for any company and trade (migration 0070), against the e2e mock data layer. Contract with the mock
// (data/mock/gcJobs, safetySeeds, deliveries): job-g ("Sample Medical Office", S-500) is a GC job being built; the mock
// user 'super' is its superintendent and 'foreman' its foreman (roles.daily_form: the superintendent's daily, the
// foreman's daily), anyone else its PM (no role form: the work log). This morning's tailgate there ("Heat illness") is
// closed with six signed in: one Sample Builders laborer, three Sample Framing Co framers, two Sample Electric
// electricians. Two deliveries are posted for today (6:30 AM Sample Concrete Co, 10:00 AM Sample Steel Co).
// Form fields (migration 0072, data/mock/dailyForms): the mock users run Sample Builders, the job's company, except
// 'foreman', who works for a sub (on the job, not in the company): only the company's admin sets up its forms.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function as(page: Page, who: string): Promise<void> {
  await page.addInitScript((u) => {
    window.localStorage.setItem('e2e-mock-user', u);
  }, who);
}

test.describe('dailies for supers and foremen (0070)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test("the super's daily: the role's form, filled from today's sign-ins, deliveries and tailgate, then submitted", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await as(page, 'super');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-setup-open').click();
    await expect(page.getByTestId('daily-form-gc_daily')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('daily-job-fields')).toHaveCount(0);

    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    await expect(editor).toContainText('will be #1');
    const manpower = editor.getByTestId('form-table-manpower');
    await expect(manpower.getByTestId('form-row-manpower')).toHaveCount(3);
    await expect(manpower.getByTestId('form-table-manpower-total')).toHaveText('Count 6');
    await expect(manpower.getByTestId('form-cell-manpower-company').nth(2)).toHaveValue('Sample Framing Co');
    await expect(manpower.getByTestId('form-cell-manpower-count').nth(2)).toHaveValue('3');
    const deliveries = editor.getByTestId('form-table-deliveries');
    await expect(deliveries.getByTestId('form-row-deliveries')).toHaveCount(2);
    await expect(deliveries.getByTestId('form-cell-deliveries-time').first()).toHaveValue('6:30 AM');
    await expect(deliveries.getByTestId('form-cell-deliveries-company').first()).toHaveValue('Sample Concrete Co');
    await expect(editor.getByTestId('form-field-safety')).toHaveValue('Tailgate held: Heat illness (6 signed in)');

    await editor.getByTestId('form-field-conditions-Clear').click();
    await editor.getByTestId('form-field-high').fill('78');
    await editor.getByTestId('form-field-low').fill('61');
    await manpower.getByTestId('form-cell-manpower-hours').nth(2).fill('24');
    await expect(manpower.getByTestId('form-table-manpower-total')).toHaveText('Count 6 · Hours 24');
    await editor.getByTestId('form-add-visitors').click();
    await editor.getByTestId('form-cell-visitors-name').fill('Sample Owner Rep');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();

    await editor.getByTestId('daily-submit').click();
    const done = page.getByTestId('daily-submitted');
    await expect(done).toContainText(/Daily Report 1 Sample Medical Office \d{2}-\d{2}-\d{4}\.pdf/);
    await expect(page.getByTestId('daily-today')).toHaveText('Edit submitted');
  });

  test('a filled-in row taken off stays off (Undo brings it back)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await as(page, 'super');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-today').click();
    const rows = page.getByTestId('daily-editor').getByTestId('form-row-deliveries');
    await expect(rows).toHaveCount(2);
    await rows.first().getByRole('button', { name: 'Remove row' }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(rows).toHaveCount(2);
    await rows.first().getByRole('button', { name: 'Remove row' }).click();
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId('daily-editor').getByText('Saved', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('daily-editor').getByTestId('form-row-deliveries')).toHaveCount(1);
  });

  test("the foreman's daily: crew and hours, work done, materials; its own number and filename", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await as(page, 'foreman');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-setup-open').click();
    await expect(page.getByTestId('daily-form-foreman_daily')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    await expect(editor.getByTestId('form-table-manpower')).toHaveCount(0);
    await editor.getByTestId('form-add-crew').click();
    await editor.getByTestId('form-cell-crew-name').fill('Sample Framer One');
    await editor.getByTestId('form-cell-crew-trade').fill('Framer');
    await editor.getByTestId('form-cell-crew-hours').fill('8');
    await editor.getByTestId('form-add-work').click();
    await editor.getByTestId('form-cell-work-area').fill('Level 2');
    await editor.getByTestId('form-cell-work-work').fill('Framed the north wall');
    await editor.getByTestId('form-field-materials').fill('Received sample studs.');
    await expect(editor.getByTestId('form-table-crew-total')).toHaveText('Hours 8');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();

    await editor.getByTestId('daily-submit').click();
    await expect(page.getByTestId('daily-submitted')).toContainText(/Foreman Daily 1 Sample Medical Office \d{2}-\d{2}-\d{4}\.pdf/);
  });

  test("form fields: the company's admin unticks, renames, adds and moves; reports are written on the company's form", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Setup and the report open in the right column of the desktop frame.');
    await as(page, 'super');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('form-setup');
    await expect(setup.getByTestId('form-setup-field-conditions-on')).toBeChecked();
    await expect(setup.getByTestId('form-setup-column-manpower-trade-name')).toHaveValue('Trade');

    await setup.getByTestId('form-setup-field-low-on').uncheck();
    const delays = setup.getByTestId('form-setup-field-delays-name');
    await expect(delays).toHaveValue('Delays / issues');
    await delays.fill('Problems');
    await delays.blur();
    await setup.getByTestId('form-setup-add-field').click();
    await setup.getByTestId('form-setup-add-field-name').fill('Crew size');
    await setup.getByTestId('form-setup-add-field-go').click();
    await expect(setup.getByTestId('form-setup-field-x_1-name')).toHaveValue('Crew size');
    await setup.getByTestId('form-setup-field-notes-up').click();
    await expect(setup.getByTestId('form-setup-field-notes-down')).toBeEnabled();
    await expect(setup.getByText('Saved', { exact: true })).toBeVisible();

    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    await expect(editor.getByTestId('form-field-high')).toBeVisible();
    await expect(editor.getByTestId('form-field-low')).toHaveCount(0);
    await expect(editor.getByTestId('form-field-delays')).toHaveAttribute('aria-label', 'Problems');
    const long = await editor.locator('textarea[data-testid^="form-field-"]').evaluateAll((all) => all.map((el) => el.getAttribute('data-testid')));
    expect(long).toEqual(['form-field-delays', 'form-field-notes', 'form-field-safety']);
    // What the job knows still fills the renamed and reordered form (its keys never change).
    await expect(editor.getByTestId('form-row-manpower')).toHaveCount(3);
    await expect(editor.getByTestId('form-field-safety')).toHaveValue('Tailgate held: Heat illness (6 signed in)');
    await editor.getByTestId('form-field-x_1').fill('14');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
    await editor.getByTestId('daily-submit').click();
    await expect(page.getByTestId('daily-submitted')).toContainText(/Daily Report 1 Sample Medical Office \d{2}-\d{2}-\d{4}\.pdf/);

    // The company changes its form again: the signed report keeps the form it was signed on.
    await page.getByTestId('daily-setup-open').click();
    const again = page.getByTestId('form-setup');
    await expect(again.getByTestId('form-setup-field-x_1-name')).toHaveValue('Crew size');
    await again.getByTestId('form-setup-field-x_1-on').uncheck();
    await expect(again.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByTestId('daily-today').click();
    await expect(page.getByTestId('daily-editor').getByTestId('form-field-x_1')).toHaveValue('14');
    await expect(page.getByTestId('daily-editor').getByTestId('form-field-delays')).toHaveAttribute('aria-label', 'Problems');
  });

  test("form fields: a field of the company's own is taken off and comes back with Undo; something stays on", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Setup opens in the right column of the desktop frame.');
    await as(page, 'pm');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-setup-open').click();
    await page.getByTestId('daily-form-foreman_daily').click();
    const setup = page.getByTestId('form-setup');
    await setup.getByTestId('form-setup-add-column-crew').click();
    await setup.getByTestId('form-setup-add-column-crew-name').fill('Badge');
    await setup.getByTestId('form-setup-add-column-crew-go').click();
    const badge = setup.getByTestId('form-setup-column-crew-x_1');
    await expect(badge.getByTestId('form-setup-column-crew-x_1-name')).toHaveValue('Badge');
    await badge.getByTestId('form-setup-column-crew-x_1-remove').click();
    await expect(badge).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(badge.getByTestId('form-setup-column-crew-x_1-name')).toHaveValue('Badge');

    // A table left on keeps a column on: the last tick is refused and said.
    for (const column of ['name', 'trade', 'hours']) await setup.getByTestId(`form-setup-column-crew-${column}-on`).uncheck();
    await setup.getByTestId('form-setup-column-crew-x_1-on').click();
    await expect(setup.getByRole('alert')).toHaveText('Keep one column on');
    await expect(setup.getByTestId('form-setup-column-crew-x_1-on')).toBeChecked();
  });

  test("form fields are the company admin's: a foreman from another company sees none", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Setup opens in the right column of the desktop frame.');
    await as(page, 'foreman');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    await expect(setup.getByTestId('daily-form-foreman_daily')).toHaveAttribute('aria-pressed', 'true');
    await expect(setup.getByTestId('daily-next-number')).toHaveValue('1');
    await expect(page.getByTestId('form-setup')).toHaveCount(0);
  });

  test('a role with no daily form of its own starts on the work log', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Setup opens in the right column of the desktop frame.');
    await as(page, 'pm');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-setup-open').click();
    await expect(page.getByTestId('daily-form-daily')).toHaveAttribute('aria-pressed', 'true');
  });

  test("phone: the super's daily opens whole, its tables in reach, nothing wider than the screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'Phone only.');
    await as(page, 'super');
    await page.goto('/p/job-g/dailies');
    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    await expect(editor.getByTestId('form-row-manpower')).toHaveCount(3);
    await expect(editor.getByTestId('form-field-high')).toBeVisible();
    const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth }));
    expect(width.page).toBeLessThanOrEqual(width.screen);
  });
});
