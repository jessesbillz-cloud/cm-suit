// The spec book (migration 0088) against the e2e mock. Job A's project manual in Specs opens straight to full screen
// with its bar (previous / next section and page, the page box) and its sections left of the pages: a search box over
// division boxes that open to their sections (Jesse, Oct 12: "type in the numbers, and clickable boxes on the left
// populate"); on a phone the same list is a sheet from the bar. A box goes to its section's first page. A requirement's
// section number opens the book there, and so does a submittal's section (job B's submittals, whose manual has
// 07 21 00, 07 92 00 and 09 29 00 but not 09 24 00): its row, its pane, and a share link to it, which opens the file
// itself. Each mock manual is the mock PDF's three pages, one section on each.
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const GYPSUM = '092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf';

const viewerOf = (page: Page): Locator => page.getByTestId('file-viewer');

/** The sections list in view: the panel beside the pages on a desktop, the sheet from the bar on a phone. */
async function sectionsOf(page: Page, isMobile: boolean): Promise<Locator> {
  const viewer = viewerOf(page);
  if (!isMobile) return viewer.getByTestId('spec-side');
  await viewer.getByTestId('spec-sections-open').click();
  return viewer.getByTestId('spec-sheet');
}

test.describe('spec book', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('the manual opens full screen from Specs; its sections sit beside the pages, and the bar moves by section and page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Uses the desktop Files screen.');
    await page.goto('/p/job-a/files?folder=job-a-specs');
    await page.getByTestId('file-row-name').filter({ hasText: 'Sample Project Manual.pdf' }).click();

    const viewer = viewerOf(page);
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual.pdf');
    const side = viewer.getByTestId('spec-side');
    await expect(side.getByTestId('spec-division')).toHaveText(['09Finishes', '10Specialties']);
    // The reader's own division starts open, its section marked.
    await expect(side.getByTestId('spec-section-box')).toHaveText(['09 21 16Gypsum Board Assemblies', '09 29 00Gypsum Board']);
    await expect(side.locator('[data-testid="spec-section-box"][aria-current="true"]')).toHaveText('09 21 16Gypsum Board Assemblies');
    await side.getByTestId('spec-division').filter({ hasText: 'Specialties' }).click();
    await side.getByTestId('spec-section-box').filter({ hasText: 'Toilet Accessories' }).click();
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');

    const bar = viewer.getByTestId('spec-bar');
    await expect(bar.getByTestId('spec-next-section')).toBeDisabled();
    await expect(bar.getByTestId('spec-next-page')).toBeDisabled();
    await bar.getByTestId('spec-prev-section').click();
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 2 of 3');
    await expect(side.locator('[aria-current="true"]')).toHaveText('09 29 00Gypsum Board');
    await bar.getByTestId('spec-prev-page').click();
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await bar.getByTestId('spec-page').fill('3');
    await bar.getByTestId('spec-page').press('Enter');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');

    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('typing a number finds the section however it is spaced; a box or Enter goes to its first page', async ({ page, isMobile }) => {
    await page.goto('/p/job-a/requirements/mock-req-ofci');
    await page.getByTestId('req-pane').getByTestId('spec-link').filter({ hasText: '10 28 00' }).click();
    const viewer = viewerOf(page);
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');

    let list = await sectionsOf(page, isMobile);
    await list.getByTestId('spec-find').fill('0929');
    await expect(list.getByTestId('spec-section-box')).toHaveText(['09 29 00Gypsum Board']);
    await list.getByTestId('spec-section-box').click();
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 2 of 3');
    if (isMobile) {
      await expect(viewer.getByTestId('spec-sheet')).toHaveCount(0);
      await expect(viewer.getByTestId('spec-sections-open')).toHaveText('09 29 00Gypsum Board');
    }

    list = isMobile ? await sectionsOf(page, isMobile) : list;
    await list.getByTestId('spec-find').fill('09 21');
    await expect(list.getByTestId('spec-section-box')).toHaveText(['09 21 16Gypsum Board Assemblies']);
    await list.getByTestId('spec-find').press('Enter');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');

    list = isMobile ? await sectionsOf(page, isMobile) : list;
    await list.getByTestId('spec-find').fill('roofing');
    await expect(list.getByTestId('spec-section-box')).toHaveCount(0);
    await expect(list.getByText('No section matches.')).toBeVisible();
    if (isMobile) {
      await list.getByTestId('spec-sheet-close').click();
      await expect(viewer.getByTestId('spec-sheet')).toHaveCount(0);
    }
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
  });

  test("a submittal's section in Submittals opens the book there; a section the book lacks is plain", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The Section column is the desktop list.');
    await page.goto('/p/job-b/files');
    await page.getByTestId('section').filter({ has: page.getByTestId('section-name').getByText('Submittals', { exact: true }) }).click();
    const row = (title: string) => page.getByTestId('file-row').filter({ hasText: title });
    await expect(row('Exterior Portland Cement Plaster').getByTestId('file-row-spec')).toHaveCount(0);
    await expect(row('Joint Sealants').getByTestId('file-row-spec')).toHaveAccessibleName('Spec 07 92 00');

    await row('Gypsum Board PD Acoustic Sealant').getByRole('button', { name: 'Spec 09 29 00' }).click();
    const viewer = viewerOf(page);
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual B.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');
  });

  test("an opened submittal has Spec 09 29 00, one click to the book's section", async ({ page }) => {
    await page.goto('/p/job-b/files/job-b-section-file-4');
    await page.getByTestId('spec-button').filter({ hasText: 'Spec 09 29 00' }).click();
    const viewer = viewerOf(page);
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual B.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');
  });

  test('a share link to a submittal opens the file itself, with Download and its spec section on it', async ({ page }) => {
    await page.goto('/s/mock-share-submittal');
    const shared = page.getByTestId('share-file');
    await expect(shared.getByTestId('share-file-name')).toHaveText(GYPSUM);
    await expect(shared.getByTestId('file-preview').getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await expect(shared.getByTestId('share-download')).toBeEnabled();
    await shared.getByTestId('spec-button').click();
    const viewer = viewerOf(page);
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual B.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');
  });

  test('someone not signed in names the address, enters the code, and lands on the open file', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'anon');
    });
    await page.goto('/s/mock-share-submittal');
    await page.getByLabel('Email').fill('pm@example.test');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Code').fill('123456');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const shared = page.getByTestId('share-file');
    await expect(shared.getByTestId('share-file-name')).toHaveText(GYPSUM);
    await expect(shared.getByTestId('file-preview').getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    // Not a member of the job: no spec book to open.
    await expect(shared.getByTestId('spec-button')).toHaveCount(0);
  });
});
