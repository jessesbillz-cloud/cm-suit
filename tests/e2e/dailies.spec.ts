// Daily reports (SPEC §13.1), against the e2e mock data layer: today's report is waiting, a note autosaves ("Saved"),
// and Submit signs it (the mock stands in for submit-daily) with the database's number and the setup's filename. The
// tool's main button then reads "Edit submitted". A company form (SPEC §8.3, the VIS daily report) on a company whose
// setting names it: its job values in Setup, its day's fields in the editor, its own numbering and filename.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
// A tiny real image (the photo compressor decodes it), synthetic.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGNowAEYhpYEAILzYAGc7g8kAAAAAElFTkSuQmCC', 'base64');
function photo(n: number) {
  return { name: `Sample photo ${String(n)}.png`, mimeType: 'image/png', buffer: PNG };
}

/** Today's report on job-a, opened, with a note saved. */
async function startWithNote(page: Page) {
  await page.goto('/p/job-a/dailies');
  await page.getByTestId('daily-today').click();
  const editor = page.getByTestId('daily-editor');
  await editor.getByTestId('note-general').fill('Sample note for the day.');
  await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
  return editor;
}

test.describe('dailies (SPEC §13.1)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The report opens in the right column of the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test("start today's report, type a note, see Saved, submit", async ({ page }) => {
    await page.goto('/p/job-a/dailies');
    const today = page.getByTestId('daily-today');
    await expect(today).toHaveText('Start');
    await today.click();

    const editor = page.getByTestId('daily-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('will be #1');
    await editor.getByTestId('note-general').fill('Sample note for the day.');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
    await expect(today).toHaveText('Continue');

    await editor.getByTestId('daily-submit').click();
    const done = page.getByTestId('daily-submitted');
    await expect(done).toBeVisible();
    await expect(done).toContainText(/Daily Report 1 Sample Job A \d{2}-\d{2}-\d{4}\.pdf/);
    await expect(done.getByTestId('daily-download')).toBeEnabled();
    await expect(today).toHaveText('Edit submitted');
    await expect(page.getByTestId('daily-row').first()).toContainText('#1');
  });

  test('setup opens from the tool header, prefilled', async ({ page }) => {
    await page.goto('/p/job-a/dailies');
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    await expect(setup.getByTestId('daily-form-daily')).toHaveAttribute('aria-pressed', 'true');
    await expect(setup.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Daily Report');
    await expect(setup.getByTestId('daily-filename-preview')).toContainText(/^Daily Report 1 Sample Job A \d{2}-\d{2}-\d{4}\.pdf$/);
  });

  // Contract with the mock: job-v ("Sample School Wing", S-400, a DSA job) belongs to Sample Inspection Co, whose
  // orgs.settings.report_generator is 'vis_daily' (data/mock/formJobs).
  test('a company form (VIS): job info prefilled in Setup, the number continues, the report files as DR_233_...', async ({ page }) => {
    await page.goto('/p/job-v/dailies');
    await expect(page.getByTestId('daily-today')).toBeVisible();
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    await expect(setup.getByTestId('daily-form-vis_daily')).toHaveAttribute('aria-pressed', 'true');
    await expect(setup.getByTestId('job-field-project_name')).toHaveValue('Sample School Wing');
    await expect(setup.getByTestId('job-field-project_no')).toHaveValue('S-400');
    await expect(setup.getByTestId('job-field-jurisdiction')).toHaveValue('DSA');
    await setup.getByTestId('job-field-architect').fill('Sample Architects');
    await setup.getByTestId('job-field-architect').blur();
    await expect(setup.getByText('Saved', { exact: true })).toBeVisible();
    const next = setup.getByTestId('daily-next-number');
    await next.fill('233');
    await next.blur();
    await expect(setup.getByTestId('daily-filename-preview')).toHaveText(/^DR_233_Sample_School_Wing_\d{4}-\d{2}-\d{2}\.pdf$/);

    await page.getByTestId('daily-today').click();
    const editor = page.getByTestId('daily-editor');
    await expect(editor).toContainText('will be #233');
    await expect(editor.getByTestId('form-field-correction_notices')).toBeVisible();
    await editor.getByTestId('form-field-contractor_activity').fill('Sample framing, level 2');
    await editor.getByTestId('form-field-ior_notes').fill('SAMPLE FRAMING\nObserved sample framing at level 2.');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();

    await editor.getByTestId('daily-submit').click();
    const done = page.getByTestId('daily-submitted');
    await expect(done).toContainText(/DR_233_Sample_School_Wing_\d{4}-\d{2}-\d{2}\.pdf/);
    await expect(page.getByTestId('daily-row').first()).toContainText('#233');
  });

  test('switching the form in Setup keeps each form\'s own setup', async ({ page }) => {
    await page.goto('/p/job-v/dailies');
    await expect(page.getByTestId('daily-today')).toBeVisible();
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    await expect(setup.getByTestId('daily-job-fields')).toBeVisible();
    await setup.getByTestId('daily-form-daily').click();
    await expect(setup.getByTestId('daily-job-fields')).toHaveCount(0);
    await expect(setup.getByTestId('daily-filename-preview')).toContainText(/^Daily Report 1 Sample School Wing/);
    await setup.getByTestId('daily-form-vis_daily').click();
    await expect(setup.getByTestId('job-field-project_name')).toHaveValue('Sample School Wing');
  });

  test('a photo removed just before Submit never reaches the signed report', async ({ page }) => {
    const editor = await startWithNote(page);
    await editor.getByTestId('daily-camera-camera-input').setInputFiles(photo(1));
    await expect(editor.getByTestId('daily-photo')).toHaveCount(1);
    await expect(editor.getByTestId('daily-photos').getByTestId('section-count')).toHaveText('1 / 40');

    // Remove it and submit inside its Undo window: the removal goes first.
    await editor.getByRole('button', { name: 'Remove photo 1' }).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await editor.getByTestId('daily-submit').click();
    await expect(page.getByTestId('daily-submitted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(editor.getByTestId('daily-photo')).toHaveCount(0);
    // Signed after the removal: the report is current, not "Changed since signed".
    await expect(editor.getByText('Changed since signed')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('daily-submitted')).toBeVisible();
    await expect(page.getByTestId('daily-photo')).toHaveCount(0);
  });

  test('the 40-photo limit is checked before anything uploads', async ({ page }) => {
    const editor = await startWithNote(page);
    await editor.getByTestId('daily-camera-camera-input').setInputFiles(Array.from({ length: 41 }, (_, i) => photo(i + 1)));
    await expect(page.getByText(/Only 40 more fit/)).toBeVisible();
    await expect(editor.getByTestId('photos-uploading')).toHaveCount(0);
    await expect(editor.getByTestId('daily-photo')).toHaveCount(0);
  });

  test('after submit: Submitted with Download and Email to project team up front; no recipients links to Setup', async ({ page }) => {
    const editor = await startWithNote(page);
    await editor.getByTestId('daily-submit').click();
    const done = page.getByTestId('daily-submitted');
    await expect(done.getByTestId('daily-download')).toBeEnabled();
    await expect(done.getByTestId('daily-email')).toHaveText('Email to project team');
    // Up front: the panel opens the report, above its contents, and no pinned footer is left.
    const panel = await done.boundingBox();
    const notes = await editor.getByTestId('note-general').boundingBox();
    expect(panel?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(notes?.y ?? 0);
    await expect(editor.getByTestId('daily-submit')).toHaveCount(0);

    const download = page.waitForEvent('download');
    await done.getByTestId('daily-download').click();
    expect((await download).suggestedFilename()).toMatch(/^Daily Report 1 Sample Job A/);

    await done.getByTestId('daily-recipients-setup').click();
    await expect(page.getByTestId('daily-setup')).toBeVisible();
  });

  test('Edit can be cancelled before a change; after one it reads Changed with Update & resubmit', async ({ page }) => {
    const editor = await startWithNote(page);
    await editor.getByTestId('daily-submit').click();
    await expect(page.getByTestId('daily-submitted')).toBeVisible();

    await editor.getByTestId('daily-edit').click();
    await expect(page.getByTestId('daily-submitted')).toHaveCount(0);
    await editor.getByTestId('daily-edit-cancel').click();
    await expect(page.getByTestId('daily-submitted')).toBeVisible();
    await expect(editor.getByTestId('daily-edit')).toBeVisible();

    await editor.getByTestId('daily-edit').click();
    await editor.getByTestId('note-general').fill('Sample note, corrected.');
    await expect(editor.getByTestId('daily-edit-cancel')).toHaveCount(0);
    await expect(editor.getByText('Changed since signed')).toBeVisible();
    await expect(editor.getByTestId('daily-submit')).toHaveText('Update & resubmit');
    await expect(editor.getByText('Saved', { exact: true })).toBeVisible();

    // The team's list never offers the old PDF as current: it is the signed copy, and says so.
    await page.getByTestId('dailies-view-team').click();
    await expect(page.getByTestId('daily-team-download').first()).toHaveAttribute('aria-label', /^Download signed copy/);
  });

  test("a new setup's recipients start with the job's team, still editable; an empty list offers the team", async ({ page }) => {
    await page.goto('/p/job-a/dailies');
    await page.getByTestId('daily-setup-open').click();
    const setup = page.getByTestId('daily-setup');
    // The work log's setup was made before (no recipients): one tap adds the team.
    await expect(setup.getByTestId('daily-recipients')).toHaveValue('');
    await setup.getByTestId('daily-recipients-team').click();
    await expect(setup.getByTestId('daily-recipients')).toHaveValue(/inspector@example\.test/);
    await expect(setup.getByText('Saved', { exact: true })).toBeVisible();

    // A form set up for the first time starts with the team.
    await setup.getByTestId('daily-form-gc_daily').click();
    const recipients = page.getByTestId('daily-recipients');
    await expect(recipients).toHaveValue(/super@example\.test/);
    await expect(recipients).not.toHaveValue(/pm@example\.test/);
    await recipients.fill('sample.reviewer@example.test');
    await recipients.blur();
    await expect(page.getByTestId('daily-setup').getByText('Saved', { exact: true })).toBeVisible();
    // No Reminder: nothing sends it yet.
    await expect(page.getByRole('combobox', { name: 'Reminder' })).toHaveCount(0);
  });
});
