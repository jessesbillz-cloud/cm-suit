// Quick phrases (0117; Jesse, Oct 23: "save whatever they want as their own quick button ... all I've got to do is tap
// it and it says the same thing every time") against the e2e mock. None ship. 'pm' works MDR's IR 7 (Sample Job B, 45
// days back, approved) here, saves a quick button from its pass note, and one tap puts the phrase in the note, saved.
// Holding it (a right-click here) opens it: Remove, with Undo.
// Test ids: ir-queue-<n>, right-column, ir-work-here, ir-result-step, phrase-new, phrase-form, phrase-text, phrase-name,
// phrase-save, phrase-chip, phrase-remove, ir-result-note, ir-outcome.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

interface TapWindow {
  __taps: number;
}

function fromToday(n: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const PHRASE = 'Inspected per sample detail 3. OK to cover.';

test.describe('quick phrases (0117)', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
      (window as unknown as TapWindow).__taps = 0;
      document.addEventListener('click', () => {
        (window as unknown as TapWindow).__taps += 1;
      }, true);
    });
  });

  test('save one from the pass note; one tap puts it in (tap budget: 1)', async ({ page }) => {
    await page.goto(`/p/job-b/inspections?view=day&day=${fromToday(-45)}`);
    await page.getByTestId('ir-queue-7').click();
    const right = page.getByTestId('right-column');
    await right.getByTestId('ir-work-here').click();
    const step = right.getByTestId('ir-result-step');
    await expect(step.getByTestId('phrase-chip')).toHaveCount(0);

    await step.getByTestId('phrase-new').click();
    const form = step.getByTestId('phrase-form');
    await expect(form).toContainText('Save a phrase you use a lot.');
    await form.getByTestId('phrase-text').fill(PHRASE);
    await expect(form.getByTestId('phrase-name')).toHaveValue('Inspected per sample detail');
    await form.getByTestId('phrase-save').click();
    await expect(form).toHaveCount(0);
    const chip = step.getByTestId('phrase-chip').filter({ hasText: 'Inspected per sample detail' });
    await expect(chip).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as TapWindow).__taps = 0;
    });
    await chip.click();
    await expect(step.getByTestId('ir-result-note')).toHaveValue(PHRASE);
    await expect(right.getByTestId('ir-outcome')).toContainText('OK to cover.');
    expect(await page.evaluate(() => (window as unknown as TapWindow).__taps)).toBeLessThanOrEqual(1);

    // Held (right-click on a desktop): Remove, then Undo brings it back.
    await chip.click({ button: 'right' });
    await step.getByTestId('phrase-remove').click();
    await expect(chip).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(chip).toBeVisible();
  });
});
