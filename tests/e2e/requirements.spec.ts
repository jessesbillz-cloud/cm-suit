// Requirements (migrations 0069, 0073) against the e2e mock: the Due list (late in red, the one-tap status with Undo),
// the AI's drafts (Keep, Drop with Undo), reading a spec section into Drafts (a repeat adds nothing) and pasted text,
// adding one by hand, a reader who sees the register but changes nothing, a sub who sees only their own company's lines
// (adds evidence there; no Add, Drafts or Read spec, by URL either), and a manager picking a line's company. The mock
// sub ('sub') is Sample Drywall's. State lives in the tab's sessionStorage.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function as(page: Page, user: string): Promise<void> {
  await page.evaluate((u) => {
    window.localStorage.setItem('e2e-mock-user', u);
  }, user);
}

test.describe('requirements', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('Due: the late one in red, a status in one tap, Undo puts it back, Done takes it off the list', async ({ page }) => {
    await page.goto('/p/job-a/requirements');
    await expect(page.getByTestId('req-counts')).toContainText('1 late');
    await expect(page.getByTestId('req-due-when-mock-req-shutdown')).toHaveAttribute('data-late', 'true');
    await expect(page.getByTestId('req-due-when-mock-req-shutdown')).toHaveText(/^Late · /);
    await expect(page.getByTestId('req-due-mock-req-ofci')).toContainText('Restroom accessories');
    await expect(page.getByTestId('req-due-mock-req-ofci')).toContainText('OFCI');
    // Due in more than 60 days: not on the list.
    await expect(page.getByTestId('req-due-mock-req-warranty')).toHaveCount(0);

    await page.getByTestId('req-status-mock-req-ofci-requested').click();
    await expect(page.getByTestId('req-status-mock-req-ofci-requested')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('status').filter({ hasText: 'Requested: Restroom accessories' }).getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('req-status-mock-req-ofci-requested')).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('req-status-mock-req-ofci-done').click();
    await expect(page.getByTestId('req-due-mock-req-ofci')).toHaveCount(0);
    await page.getByTestId('req-view-all').click();
    await expect(page.getByTestId('req-row-mock-req-ofci')).toContainText('Done');
    await page.getByTestId('req-by-section').click();
    await expect(page).toHaveURL(/by=section/);
    await expect(page.getByTestId('req-group-10 28 00')).toContainText('Toilet Accessories');
  });

  test('Drafts: each with its quoted sentence; Keep one, Drop one and Undo', async ({ page }) => {
    await page.goto('/p/job-a/requirements?view=drafts');
    await expect(page.getByTestId('req-view-drafts')).toHaveText('Drafts 3');
    const keys = page.getByTestId('req-draft-mock-req-draft-keys');
    await expect(keys.getByTestId('req-quote')).toHaveText(/two \(2\) spare keys/);
    await expect(keys).toContainText('Sample Spec Book Vol 2.pdf p. 403');
    await page.getByTestId('req-keep-mock-req-draft-keys').click();
    await expect(keys).toHaveCount(0);
    await expect(page.getByTestId('req-view-drafts')).toHaveText('Drafts 2');

    await page.getByTestId('req-drop-mock-req-draft-mirror').click();
    await expect(page.getByTestId('req-draft-mock-req-draft-mirror')).toHaveCount(0);
    // The Keep toast may still be up: Undo in the Drop's own toast.
    await page.getByRole('status').filter({ hasText: 'Dropped: Mirror special warranty' }).getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('req-draft-mock-req-draft-mirror')).toBeVisible();

    await page.getByTestId('req-view-all').click();
    await expect(page.getByTestId('req-row-mock-req-draft-keys')).toContainText('Spare accessory lock keys');
    await expect(page.getByTestId('req-row-mock-req-draft-mirror')).toHaveCount(0);
  });

  test('Read spec: a section of the spec book lands in Drafts; reading it again adds nothing; pasted text too', async ({ page }) => {
    await page.goto('/p/job-a/requirements');
    await page.getByTestId('req-read').click();
    await expect(page.getByTestId('req-read-form')).toContainText('Text not read yet');
    await page.getByTestId('req-section-search').fill('fire');
    await expect(page.getByTestId('req-section-10 28 00')).toHaveCount(0);
    await page.getByTestId('req-section-28 46 21.11').click();
    await expect(page.getByRole('status').filter({ hasText: '2 drafts · 1 already here' })).toBeVisible();
    await expect(page).toHaveURL(/view=drafts/);
    await expect(page.getByTestId('req-drafts')).toContainText('Fire alarm owner training (4 hours)');
    await expect(page.getByTestId('req-drafts')).toContainText("Schedule training with at least 14 days' notice.");

    await page.getByTestId('req-read').click();
    await page.getByTestId('req-section-28 46 21.11').click();
    await expect(page.getByRole('status').filter({ hasText: '0 drafts · 3 already here' })).toBeVisible();

    await page.getByTestId('req-read').click();
    await page.getByTestId('req-source-paste').click();
    await expect(page.getByTestId('req-paste-read')).toBeDisabled();
    await page.getByTestId('req-paste').fill('Notify the Owner in writing 14 days before the sample utility shutdown. Other text follows.');
    await page.getByTestId('req-paste-read').click();
    await expect(page.getByRole('status').filter({ hasText: '1 draft' })).toBeVisible();
    await expect(page.getByTestId('req-drafts')).toContainText('Pasted');
  });

  test('add one by hand; a reader sees the register and changes nothing', async ({ page }) => {
    await page.goto('/p/job-a/requirements');
    await page.getByTestId('req-add').click();
    await expect(page.getByTestId('req-save')).toBeDisabled();
    await page.getByTestId('req-kind-cfci').click();
    await page.getByTestId('req-title').fill('Sample lockers');
    await page.getByTestId('req-who').fill('Sample Specialties Co');
    await page.getByTestId('req-section').fill('105113');
    await page.getByTestId('req-trigger').fill('Lockers install');
    await page.getByTestId('req-trigger-date').fill('2030-01-15');
    await page.getByTestId('req-lead').fill('42');
    await page.getByTestId('req-save').click();
    await expect(page).toHaveURL(/\/p\/job-a\/requirements\/mock-req-\d+\?view=all$/);
    await expect(page.getByTestId('req-pane-title')).toHaveText('Sample lockers');
    await expect(page.getByTestId('req-pane')).toContainText('10 51 13');
    await expect(page.getByTestId('req-pane')).toContainText('42 days before Lockers install (Jan 15)');
    await expect(page.getByTestId('req-pane-due')).toHaveText('Due Dec 4');

    await as(page, 'super');
    await page.goto('/p/job-a/requirements');
    await expect(page.getByTestId('req-due-mock-req-ofci')).toBeVisible();
    await expect(page.getByTestId('req-add')).toHaveCount(0);
    await expect(page.getByTestId('req-read')).toHaveCount(0);
    await expect(page.getByTestId('req-view-drafts')).toHaveCount(0);
    await expect(page.getByTestId('req-status-mock-req-ofci-done')).toHaveCount(0);
    await page.getByTestId('req-due-mock-req-ofci').getByRole('button').first().click();
    await expect(page.getByTestId('req-pane-title')).toHaveText('Restroom accessories');
    await expect(page.getByTestId('req-edit')).toHaveCount(0);
    await expect(page.getByTestId('req-remove')).toHaveCount(0);
  });

  test('a sub sees only their own company\'s lines, adds evidence on one, and reaches nothing else', async ({ page, isMobile }) => {
    await page.goto('/p/job-a/requirements');
    await as(page, 'sub');
    await page.goto('/p/job-a/requirements');
    if (!isMobile) await expect(page.getByTestId('rail-requirements')).toBeVisible();
    // Due: Sample Drywall's one line due in 60 days; nobody else's (the owner's, the late notice).
    await expect(page.getByTestId('req-due-mock-req-gyp-stock')).toContainText('Extra gypsum board (1%)');
    await expect(page.getByTestId('req-due').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('req-counts')).toHaveText('1 due in 60 days');
    await expect(page.getByTestId('req-add')).toHaveCount(0);
    await expect(page.getByTestId('req-read')).toHaveCount(0);
    await expect(page.getByTestId('req-view-drafts')).toHaveCount(0);
    await expect(page.getByTestId('req-status-mock-req-gyp-stock-done')).toHaveCount(0);

    // All: their two lines, not Sample Roofing's warranty; no grouping by company.
    await page.getByTestId('req-view-all').click();
    await expect(page.getByTestId('req-all').locator('[data-testid^="req-row-"]')).toHaveCount(2);
    await expect(page.getByTestId('req-row-mock-req-gyp-mockup')).toContainText('Level 4 finish mockup');
    await expect(page.getByTestId('req-row-mock-req-warranty')).toHaveCount(0);
    await expect(page.getByTestId('req-by-section')).toBeVisible();
    await expect(page.getByTestId('req-by-company')).toHaveCount(0);

    // Their line: what, where in the book, when; the status is the managers'; the evidence is theirs to add.
    await page.getByTestId('req-row-mock-req-gyp-stock').click();
    await expect(page.getByTestId('req-pane-title')).toHaveText('Extra gypsum board (1%)');
    await expect(page.getByTestId('req-pane')).toContainText('09 29 00 Gypsum Board ¶1.6.A');
    await expect(page.getByTestId('req-pane-due')).toHaveText(/^Due /);
    await expect(page.getByTestId('req-pane-status')).toHaveCount(0);
    await expect(page.getByTestId('req-edit')).toHaveCount(0);
    await expect(page.getByTestId('req-remove')).toHaveCount(0);
    await page.getByTestId('req-evidence-note').fill('Delivered to the custodian; receipt attached.');
    await page.getByTestId('req-evidence-note').blur();
    await expect(page.getByTestId('req-pane').getByText('Saved', { exact: true })).toBeVisible();
    await page.getByTestId('req-evidence-input').setInputFiles({ name: 'sample-receipt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic receipt') });
    await expect(page.getByTestId('req-evidence-file')).toContainText('Sample evidence');

    // By URL: no Add, no Read spec, no Drafts, and another company's line is not there.
    await page.goto('/p/job-a/requirements/new');
    await expect(page.getByText("You can't add requirements on this job.")).toBeVisible();
    await expect(page.getByTestId('req-form')).toHaveCount(0);
    await page.goto('/p/job-a/requirements/read');
    await expect(page.getByText("You can't read the spec book on this job.")).toBeVisible();
    await expect(page.getByTestId('req-read-form')).toHaveCount(0);
    await page.goto('/p/job-a/requirements/mock-req-warranty');
    await expect(page.getByText('That requirement is gone.')).toBeVisible();
    await page.goto('/p/job-a/requirements?view=drafts');
    await expect(page.getByTestId('req-due-mock-req-gyp-stock')).toBeVisible();
    await expect(page.getByTestId('req-drafts')).toHaveCount(0);

    // The manager sees what the sub added.
    await as(page, 'pm');
    await page.goto('/p/job-a/requirements/mock-req-gyp-stock?view=all');
    await expect(page.getByTestId('req-evidence-note')).toHaveValue('Delivered to the custodian; receipt attached.');
    await expect(page.getByTestId('req-evidence-file')).toContainText('Sample evidence');
  });

  test('a manager picks the company on a line; All groups by company; that company\'s sub then sees the line', async ({ page }) => {
    await page.goto('/p/job-a/requirements/mock-req-rep?view=all');
    await expect(page.getByTestId('req-pane')).toContainText('Roofing sub');
    await page.getByTestId('req-edit').click();
    // Words that name no company on the job: none picked. Picking one writes its name.
    await expect(page.getByTestId('req-company')).toHaveValue('');
    await page.getByTestId('req-company').selectOption('mock-org-drywall');
    await expect(page.getByTestId('req-who')).toHaveValue('Sample Drywall');
    // Other words drop the pick; words that are exactly a company's name pick it.
    await page.getByTestId('req-who').fill('Roofer');
    await expect(page.getByTestId('req-company')).toHaveValue('');
    await page.getByTestId('req-who').fill('Sample Roofing');
    await expect(page.getByTestId('req-company')).toHaveValue('mock-org-roofing');
    await page.getByTestId('req-company').selectOption('mock-org-drywall');
    await page.getByTestId('req-save').click();
    await expect(page.getByTestId('req-pane')).toContainText('Sample Drywall');

    await page.goto('/p/job-a/requirements?view=all');
    await page.getByTestId('req-by-company').click();
    await expect(page).toHaveURL(/by=company/);
    await expect(page.getByTestId('req-group-mock-org-drywall')).toContainText("Roofing manufacturer's field rep");
    await expect(page.getByTestId('req-group-mock-org-roofing')).toContainText('Roofing special warranty (2 years)');
    await expect(page.getByTestId('req-group-none')).toContainText('Restroom accessories');

    await as(page, 'sub');
    await page.goto('/p/job-a/requirements?view=all');
    await expect(page.getByTestId('req-row-mock-req-rep')).toContainText("Roofing manufacturer's field rep");
    await expect(page.getByTestId('req-all').locator('[data-testid^="req-row-"]')).toHaveCount(3);
  });
});
