// Date and time boxes (Jesse, Oct 5: "When I clicked inside the box nothing happened. It wanted me to click the exact
// calendar button"): a click anywhere in the box opens the browser's picker. Every date and time box in the app is
// TextField or DateInput (src/ui/Fields.tsx, lint bans a bare one), so the calendar's line form stands for all of them.
// The picker itself is the browser's: a page-level spy on showPicker records each call instead of opening it.
// Contract with the mock: 'pm' manages the calendar on Sample Job A; a new line is timed (not all day) by default.
import process from 'node:process';
import { expect, test } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

interface PickerWindow {
  __pickers: string[];
}

test.describe('date and time boxes', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('a click in the middle of a date or time box opens the picker', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
      const w = window as unknown as PickerWindow;
      w.__pickers = [];
      HTMLInputElement.prototype.showPicker = function showPicker(this: HTMLInputElement) {
        w.__pickers.push(this.type);
      };
    });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
    await page.goto(`/p/job-a/calendar?day=${day}`);
    await page.getByTestId(`cal-add-${day}`).click();

    const date = page.getByTestId('cal-date');
    await date.click();
    await expect(date).toBeFocused();
    await page.getByTestId('cal-start').click();
    expect(await page.evaluate(() => (window as unknown as PickerWindow).__pickers)).toEqual(['date', 'time']);

    // A plain text box never asks for a picker.
    await page.getByTestId('cal-title').click();
    expect(await page.evaluate(() => (window as unknown as PickerWindow).__pickers)).toHaveLength(2);
  });
});
