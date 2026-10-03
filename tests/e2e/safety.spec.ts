// Safety (migration 0060) against the e2e mock: the PM starts a tailgate from the library, the crew signs from the QR's
// page with no login (the mock user 'anon': no session), the leader sees the line, ticks in a member and closes, and the
// sign-in sheet downloads in one click. The library opens a talk with its regulation's page. State lives in the tab's
// sessionStorage, so the visitor and the leader share one page.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function sign(page: Page, name: string): Promise<void> {
  await page.getByTestId('signin-name').fill(name);
  await page.getByTestId('signin-company').fill('Sample Framing Co');
  await page.getByTestId('signin-trade').fill('Framer');
  const pad = await page.getByTestId('signin-pad').boundingBox();
  if (!pad) throw new Error('no signature pad');
  await page.mouse.move(pad.x + 20, pad.y + pad.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(pad.x + 20 + i * 14, pad.y + pad.height * (0.6 - 0.15 * Math.sin(i)));
  await page.mouse.up();
  await page.getByTestId('signin-submit').click();
}

test.describe('safety meetings', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('start a tailgate, the crew signs from the QR with no login, close makes the sheet', async ({ page }) => {
    await page.goto('/p/job-a/safety');
    await expect(page.getByTestId('safety-due')).toContainText('Next tailgate by');
    await page.getByTestId('safety-new').click();
    await expect(page.getByTestId('safety-start')).toBeDisabled();
    await page.getByTestId('safety-kind-tailgate').click();
    await page.getByTestId('safety-topic-category-health').click();
    await page.getByTestId('safety-topic-heat-illness').click();
    await page.getByTestId('safety-location').fill('North gate');
    await page.getByTestId('safety-start').click();

    // The meeting: its number, the outline to read out, the big QR and its link.
    await expect(page.getByTestId('safety-meeting-label')).toHaveText(/Tailgate \d+/);
    await expect(page.getByTestId('safety-meeting-title')).toHaveText('Heat illness');
    await expect(page.getByTestId('safety-outline')).toContainText('Drink water often');
    await expect(page.getByTestId('qr-code')).toBeVisible();
    const link = ((await page.getByTestId('safety-link').textContent()) ?? '').trim();
    expect(link).toMatch(/\/m\/[^/?]+\?t=[A-Za-z0-9_-]{43}$/);
    const meetingPath = `/p/job-a/safety/${link.split('/m/')[1]?.split('?')[0] ?? ''}`;

    // The crew: no session, the QR's page, name, company, trade, signature, Sign, done; Next person clears the form.
    await page.evaluate(() => {
      window.localStorage.setItem('e2e-mock-user', 'anon');
    });
    await page.goto(new URL(link).pathname + new URL(link).search);
    await expect(page.getByTestId('public-job')).toHaveText('Heat illness');
    await expect(page.getByTestId('signin-submit')).toBeDisabled();
    await sign(page, 'Sample Laborer Two');
    await expect(page.getByTestId('signin-done')).toContainText('Sample Laborer Two');
    await page.getByTestId('signin-next').click();
    await expect(page.getByTestId('signin-name')).toHaveValue('');
    await sign(page, 'sample laborer two');
    await expect(page.getByTestId('signin-done')).toBeVisible();

    // The leader: one line for that name, tick in a member, close; the sheet downloads in one click.
    await page.evaluate(() => {
      window.localStorage.setItem('e2e-mock-user', 'pm');
    });
    await page.goto(meetingPath);
    await expect(page.getByTestId('safety-line')).toHaveCount(1);
    await expect(page.getByTestId('safety-roster')).toContainText('Sample Laborer Two');
    await page.getByTestId('safety-tick-mock-user-sub').click();
    await expect(page.getByTestId('safety-line')).toHaveCount(2);
    await expect(page.getByTestId('safety-roster')).toContainText('Ticked in');
    await page.getByTestId('safety-close').click();
    await expect(page.getByTestId('safety-meeting')).toHaveAttribute('data-status', 'closed');
    await expect(page.getByTestId('safety-qr')).toHaveCount(0);
    await expect(page.getByTestId('safety-signature')).toHaveCount(1);
    const download = page.waitForEvent('download');
    await page.getByTestId('safety-sheet-download').click();
    expect((await download).suggestedFilename()).toMatch(/^Tailgate \d{3} Sample Job A\.pdf$/);

    // The closed meeting's link opens nothing.
    await page.evaluate(() => {
      window.localStorage.setItem('e2e-mock-user', 'anon');
    });
    await page.goto(new URL(link).pathname + new URL(link).search);
    await expect(page.getByTestId('signin-ended')).toBeVisible();
  });

  test('the library: a starter talk with its regulation; only a safety manager adds topics', async ({ page }) => {
    await page.goto('/p/job-a/safety?view=library');
    await expect(page.getByTestId('safety-new-topic')).toHaveCount(0);
    await page.getByTestId('safety-library-search').fill('ladder');
    await page.getByTestId('safety-library-ladders').click();
    await expect(page.getByTestId('safety-topic')).toContainText('three points of contact');
    await expect(page.getByTestId('safety-outline-source')).toHaveAttribute('href', 'https://www.dir.ca.gov/title8/1675.html');
    await expect(page.getByTestId('safety-topic-edit')).toHaveCount(0);

    await page.evaluate(() => {
      window.localStorage.setItem('e2e-mock-user', 'safety');
    });
    await page.goto('/p/job-a/safety?view=library');
    await page.getByTestId('safety-new-topic').click();
    await page.getByTestId('safety-topic-category-equipment').click();
    await page.getByTestId('safety-topic-title').fill('Sample crane signals');
    await page.getByTestId('safety-topic-points').fill('Only the signal person talks to the operator.\nAgree on the signals first.');
    await page.getByTestId('safety-topic-save').click();
    await expect(page.getByTestId('safety-topic')).toContainText('Sample crane signals');
    await expect(page.getByTestId('safety-topic')).toContainText('Ours');
    await expect(page.getByTestId('safety-topic-edit')).toBeVisible();
  });
});
