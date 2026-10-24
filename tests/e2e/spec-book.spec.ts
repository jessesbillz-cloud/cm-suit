// The spec reader (migrations 0088, 0118) against the e2e mock. Files > Specs keeps the spec book in the right column
// (Jesse, Oct 23: "Use the right side ... click Volume 1 and the right side expands into the sections, click a section
// and the main page changes to it"): job A has two volumes, so the book opens as two rows; a volume shows its divisions
// with their sections, a section shows in the main column as text (PART headings, articles, paragraphs), with Show the
// PDF pages (the same column, one tap back) and Previous / Next section through both volumes. A search box finds a
// section by number however it is spaced, or by words. On a phone the book is the first screen, a section the next,
// with Back. Every "Spec 09 29 00" (a requirement, a submittal row, an opened submittal, a share link) opens the
// section's text. The mock's section text is synthetic, parsed by the server's own parser; 26 51 00 is a scan.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const GYPSUM = '092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf';
const SPECS_A = '/p/job-a/files?folder=job-a-specs';

const book = (page: Page) => page.getByTestId('spec-book');
const main = (page: Page) => page.getByTestId('main-area');

test.describe('spec reader', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (window.localStorage.getItem('e2e-mock-user') === null) window.localStorage.setItem('e2e-mock-user', 'pm');
    });
  });

  test('Specs: the book beside it, a volume opens to its sections, a section shows as text, its pages and back, next', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto(SPECS_A);
    await expect(page.getByTestId('right-column-title')).toHaveText('Spec book');
    const volumes = book(page).getByTestId('spec-volume');
    await expect(volumes).toHaveText([/^Sample Project Manual3$/, /^Sample Project Manual Volume 23$/]);
    await expect(book(page).getByTestId('spec-section-box')).toHaveCount(0);
    // The main column still lists the Specs files (upload, download).
    await expect(main(page).getByTestId('file-row-name').filter({ hasText: 'Sample Project Manual.pdf' })).toHaveCount(1);

    await volumes.first().click();
    await expect(volumes.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(book(page).getByTestId('spec-division')).toHaveText(['09Finishes', '10Specialties']);
    await expect(book(page).getByTestId('spec-section-box')).toHaveText(['09 21 16Gypsum Board Assemblies', '09 29 00Gypsum Board', '10 28 00Toilet Accessories']);

    await book(page).getByTestId('spec-section-box').filter({ hasText: '09 29 00' }).click();
    await expect(page).toHaveURL(/vol=job-a-file-manual&|vol=job-a-file-manual$/);
    await expect(page).toHaveURL(/at=2/);
    const section = main(page).getByTestId('spec-section');
    await expect(section.getByTestId('spec-section-number')).toHaveText('09 29 00');
    await expect(section.getByTestId('spec-section-title')).toHaveText('Gypsum Board');
    await expect(section.getByTestId('spec-part')).toHaveCount(3);
    await expect(section.getByTestId('spec-part').first()).toHaveText('Part 1GENERAL');
    await expect(section.getByTestId('spec-article').first()).toHaveText('1.01SUMMARY');
    await expect(section.locator('[data-testid="spec-para"][data-level="2"]').first()).toContainText('Gypsum Board for the sample building, complete as shown on the drawings.');
    await expect(section.getByTestId('spec-text')).not.toContainText('SAMPLE SCHOOL MODERNIZATION');
    await expect(book(page).locator('[data-testid="spec-section-box"][aria-current="true"]')).toHaveText('09 29 00Gypsum Board');
    await expect(section.getByTestId('spec-hub-submittals')).toHaveCount(0);

    // The PDF pages in the same column, then one tap back to the text.
    await section.getByTestId('spec-show-pages').click();
    const pages = main(page).getByTestId('spec-pages');
    await expect(pages.getByTestId('file-preview').getByTestId('viewer-page')).toHaveText('Page 2 of 3');
    await expect(main(page).getByTestId('spec-section')).toHaveCount(0);
    await pages.getByTestId('spec-show-text').click();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('09 29 00');

    // Next section, then on into Volume 2, whose row opens; a scan keeps its pages only.
    await main(page).getByTestId('spec-next-section').click();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('10 28 00');
    await main(page).getByTestId('spec-next-section').click();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('22 11 16');
    await expect(volumes.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(main(page).getByTestId('spec-section-where')).toHaveText('Sample Project Manual Volume 2, page 1');
    await book(page).getByTestId('spec-section-box').filter({ hasText: '26 51 00' }).click();
    await expect(main(page).getByTestId('spec-text-none')).toBeVisible();
    await expect(main(page).getByTestId('spec-next-section')).toHaveCount(0);
    await main(page).getByTestId('spec-prev-section').click();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('26 05 19');

    // Back goes back through the sections read.
    await page.goBack();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('26 51 00');
  });

  test('the search finds a section by number however it is spaced, or by words, across volumes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto(SPECS_A);
    const find = book(page).getByTestId('spec-find');
    for (const typed of ['0929', '09 29', '092900']) {
      await find.fill(typed);
      await expect(book(page).getByTestId('spec-section-box')).toHaveText(['09 29 00Gypsum Board']);
    }
    await find.fill('lighting');
    await expect(book(page).getByTestId('spec-section-box')).toHaveText(['26 51 00Interior Lighting']);
    await expect(book(page)).toContainText('Sample Project Manual Volume 2');
    await find.fill('roofing');
    await expect(book(page).getByText('No section matches.')).toBeVisible();
    await find.fill('09 21');
    await find.press('Enter');
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('09 21 16');
  });

  test('a spec book row in Specs opens its pages in the main column, not a window', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Uses the desktop Files list.');
    await page.goto(SPECS_A);
    await main(page).getByTestId('file-row-name').filter({ hasText: 'Sample Project Manual.pdf' }).click();
    await expect(page.getByTestId('file-viewer')).toHaveCount(0);
    await expect(main(page).getByTestId('spec-pages').getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await expect(page.getByTestId('right-column-title')).toHaveText('Spec book');
  });

  test('phone: the book is the Specs screen, a section the next one, Back returns to the book', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'The phone shell.');
    await page.goto(SPECS_A);
    await book(page).getByTestId('spec-volume').first().click();
    await book(page).getByTestId('spec-section-box').filter({ hasText: '09 29 00' }).click();
    await expect(book(page)).toHaveCount(0);
    await expect(main(page).getByTestId('spec-part')).toHaveCount(3);
    await main(page).getByTestId('spec-show-pages').click();
    await expect(main(page).getByTestId('spec-pages').getByTestId('viewer-page')).toHaveText('Page 2 of 3');
    await main(page).getByTestId('spec-show-text').click();
    await main(page).getByTestId('spec-back').click();
    await expect(book(page).getByTestId('spec-section-box')).toHaveCount(3);
  });

  test("a requirement's section number opens the section's text", async ({ page }) => {
    await page.goto('/p/job-a/requirements/mock-req-ofci');
    await page.getByTestId('req-pane').getByTestId('spec-link').filter({ hasText: '10 28 00' }).click();
    await expect(page).toHaveURL(/\/p\/job-a\/files\?/);
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('10 28 00');
    await expect(page.getByTestId('file-viewer')).toHaveCount(0);
  });

  test("a submittal's Spec 09 29 00 opens the section with the submittal under it; a section the book lacks is plain", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The Section column is the desktop list.');
    await page.goto('/p/job-b/files');
    await page.getByTestId('section').filter({ has: page.getByTestId('section-name').getByText('Submittals', { exact: true }) }).click();
    const row = (title: string) => page.getByTestId('file-row').filter({ hasText: title });
    await expect(row('Exterior Portland Cement Plaster').getByTestId('file-row-spec')).toHaveCount(0);
    await expect(row('Joint Sealants').getByTestId('file-row-spec')).toHaveAccessibleName('Spec 07 92 00');

    await row('Gypsum Board PD Acoustic Sealant').getByRole('button', { name: 'Spec 09 29 00' }).click();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('09 29 00');
    await expect(main(page).getByTestId('spec-hub-submittals').getByTestId('spec-hub-row')).toContainText(GYPSUM);
    await expect(page.getByTestId('right-column-title')).toHaveText('Spec book');
  });

  test('an opened submittal has Spec 09 29 00, one click to the section', async ({ page }) => {
    await page.goto('/p/job-b/files/job-b-section-file-4');
    await page.getByTestId('spec-button').filter({ hasText: 'Spec 09 29 00' }).click();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('09 29 00');
  });

  test('a share link to a submittal opens the file itself, with Download and its spec section on it', async ({ page }) => {
    await page.goto('/s/mock-share-submittal');
    const shared = page.getByTestId('share-file');
    await expect(shared.getByTestId('share-file-name')).toHaveText(GYPSUM);
    await expect(shared.getByTestId('file-preview').getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await expect(shared.getByTestId('share-download')).toBeEnabled();
    await shared.getByTestId('spec-button').click();
    await expect(main(page).getByTestId('spec-section-number')).toHaveText('09 29 00');
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
