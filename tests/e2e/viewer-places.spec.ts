// The file viewer where files and photos show in inspections, the calendar card, RFIs, corrections and safety (Jesse,
// Oct 4: "wherever a file or photo shows, a tap opens it full screen"), against the e2e mock: each place opens the
// viewer and shows the picture or the PDF's page, arrows walk a strip, Escape closes it. The mock shows a photo as a
// synthetic site picture and every PDF (an IR, an RFI PDF, a sign-in sheet, a talk) as the synthetic 3-page plan set.
// Mock users: 'pm' (requests and decides inspections), 'sub' (writes RFIs), 'inspector' (corrections), 'safety'
// (library topics), 'anon' (the request link with no login). Test ids: ir-attach-input, ir-attach-open, attachment-view,
// ir-photo, photo-open, ir-view-ir, ir-download-ir, cal-view-ir, cal-file, public-file-open, rfi-photo, rfi-file-open,
// rfi-full-screen, cn-photo, cn-notice-view, safety-sheet-view, safety-topic-pdf-view, safety-outline-view, and the
// viewer's file-viewer, viewer-count, viewer-next, viewer-page, viewer-delete.
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const TOKEN = 'sample-request-token-sample-request-token-1';
/** A 1 x 1 PNG: a real image, so the photo compressor and the browser can read it. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });
const PDF = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% sample\n%%EOF\n') });

/** Switches the mock user and opens a page; if the page reloads itself just then, the open is tried once more. */
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

/** Today in the sample jobs' zone. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

function viewerOf(page: Page): Locator {
  return page.getByTestId('file-viewer');
}

/** The viewer shows a PDF's first page of the synthetic set; Escape closes it. */
async function seesPdfThenEscape(page: Page): Promise<void> {
  const viewer = viewerOf(page);
  await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
}

test.describe('the file viewer in each place', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('inspections: request files, result photos, View IR, and the calendar card', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/');

    // A request with a PDF and a photo: a tap on a file before sending opens it.
    await openAs(page, 'pm', '/p/job-a/inspections?view=week');
    await page.getByTestId('ir-new').click();
    await page.getByTestId('ir-time').selectOption('09:00');
    await page.getByTestId('ir-items').fill('Sample footing rebar at grid B');
    await page.getByTestId('ir-attach-input').setInputFiles([PDF('sample-layout.pdf'), photo('sample-site.png')]);
    await expect(page.getByTestId('ir-attach-open')).toHaveCount(2);
    await page.getByTestId('ir-attach-open').first().click();
    await seesPdfThenEscape(page);
    await page.getByTestId('ir-ack').check();
    await page.getByTestId('ir-submit').click();
    await expect(page.getByTestId('ir-receipt-number')).toHaveText(/^IR \d+$/);
    const n = ((await page.getByTestId('ir-receipt-number').textContent()) ?? '').replace('IR ', '');

    // The request's files open through the request, with arrows between them.
    await openAs(page, 'pm', `/p/job-a/inspections/mock-ir-${n}`);
    const pane = page.getByTestId('right-column');
    await expect(pane.getByTestId('attachment-view')).toHaveCount(2);
    await expect(pane.getByTestId('attachment-view').last()).toContainText('sample-site.jpg');
    await pane.getByTestId('attachment-view').first().click();
    const viewer = viewerOf(page);
    await expect(viewer.getByTestId('viewer-count')).toHaveText('1 of 2');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 1 of 3');
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByTestId('viewer-count')).toHaveText('2 of 2');
    await expect(viewer.getByRole('img', { name: 'sample-site.jpg' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    // Result photos: a tap opens them full screen with arrows; Delete inside takes one off, Undo puts it back.
    await pane.getByTestId('ir-confirm').click();
    await expect(pane.getByTestId('ir-tracker')).toContainText('Confirmed');
    await pane.getByTestId('ir-result-approved').click();
    await expect(pane.getByTestId('ir-outcome')).toContainText('Approved');
    await pane.getByTestId('ir-result-step').getByTestId('ir-attach-input').setInputFiles([photo('result-a.png'), photo('result-b.png')]);
    const tiles = pane.getByTestId('ir-photo');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.last().getByTestId('photo-open')).toHaveAttribute('aria-label', 'Open result-b.jpg');
    await tiles.first().getByTestId('photo-open').click();
    await expect(viewer.getByTestId('viewer-count')).toHaveText('1 of 2');
    await expect(viewer.getByRole('img', { name: 'result-a.jpg' })).toBeVisible();
    await viewer.getByTestId('viewer-next').click();
    await expect(viewer.getByTestId('viewer-count')).toHaveText('2 of 2');
    await expect(viewer.getByRole('img', { name: 'result-b.jpg' })).toBeVisible();
    await viewer.getByTestId('viewer-delete').click();
    await expect(viewer.getByTestId('viewer-count')).toHaveCount(0);
    await expect(tiles).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    await page.getByRole('status').filter({ hasText: 'Photo removed' }).getByRole('button', { name: 'Undo' }).click();
    await expect(tiles).toHaveCount(2);

    // The IR: View IR shows its pages; Download beside it saves it in one click.
    await pane.getByTestId('ir-generate').click();
    await pane.getByTestId('ir-view-ir').click();
    await seesPdfThenEscape(page);
    const saved = page.waitForEvent('download');
    await pane.getByTestId('ir-download-ir').click();
    expect((await saved).suggestedFilename()).toMatch(new RegExp(`^IR ${n} Sample Job A .*\\.pdf$`));

    // The calendar card: View IR and the files open the viewer.
    await openAs(page, 'pm', `/p/job-a/calendar?day=${today()}`);
    const card = page.getByTestId('cal-day-detail').getByTestId('cal-request').filter({ hasText: new RegExp(`IR ${n}\\b`) });
    await card.getByTestId('cal-view-ir').click();
    await seesPdfThenEscape(page);
    await expect(card.getByTestId('cal-file').last()).toContainText('sample-site.jpg');
    await card.getByTestId('cal-file').last().click();
    await expect(viewer.getByTestId('viewer-count')).toHaveText('2 of 2');
    await expect(viewer.getByRole('img', { name: 'sample-site.jpg' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('the request link with no login: a picked photo shows, and opens full screen', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('e2e-mock-user', 'anon');
    });
    await page.goto(`/r/job-a?t=${TOKEN}`);
    await page.getByTestId('public-files-input').setInputFiles([photo('sample-north-wall.png'), PDF('sample-sketch.pdf')]);
    await expect(page.getByTestId('public-files')).toContainText('sample-sketch.pdf');
    await expect(page.getByTestId('public-file-open')).toHaveCount(1);
    await page.getByTestId('public-file-open').click();
    const viewer = viewerOf(page);
    await expect(viewer.getByRole('img', { name: 'sample-north-wall.png' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
  });

  test('RFIs: question photos with arrows, an answer file, and the RFI PDF full screen in the app', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/');
    const right = page.getByTestId('right-column');
    const viewer = viewerOf(page);

    // The seeded answered RFI's attached sheet.
    await openAs(page, 'pm', '/p/job-a/rfis/mock-rfi-job-a-2');
    await page.getByTestId('rfi-answer').getByTestId('rfi-file-open').click();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Plan Set A.pdf');
    await seesPdfThenEscape(page);

    // A new RFI with two photos: a tap on one opens both, with arrows.
    await openAs(page, 'sub', '/p/job-a/rfis');
    await page.getByTestId('rfi-new').click();
    await page.getByTestId('rfi-title').fill('Sample sill plate anchor at grid 5');
    await page.getByTestId('rfi-question').fill('Sample question: which anchor applies at the sill plate?');
    await page.getByTestId('rfi-photo-input').setInputFiles([photo('rfi-a.png'), photo('rfi-b.png')]);
    await expect(page.getByTestId('cn-picked-photo')).toHaveCount(2);
    await page.getByTestId('rfi-send').click();
    await expect(right.getByTestId('rfi-status')).toHaveText('In review');
    await expect(right.getByTestId('rfi-photo')).toHaveCount(2);
    await right.getByTestId('rfi-photo').first().getByTestId('photo-open').click();
    await expect(viewer.getByTestId('viewer-count')).toHaveText('1 of 2');
    await expect(viewer.getByRole('img', { name: 'rfi-a.jpg' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByRole('img', { name: 'rfi-b.jpg' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    // Full screen: the RFI's PDF in the app's viewer, not a new tab.
    await right.getByTestId('rfi-full-screen').click();
    await seesPdfThenEscape(page);
    expect(page.context().pages()).toHaveLength(1);
  });

  test('corrections: the photo strip walks with arrows; the notice has View', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The right column is the desktop frame.');
    await page.goto('/');
    await openAs(page, 'inspector', '/p/job-a/corrections');
    await page.getByTestId('cn-new').click();
    await page.getByTestId('cn-title').fill('Sample missing firestop at sleeve');
    await page.getByTestId('cn-photo-input').setInputFiles([photo('cn-a.png'), photo('cn-b.png')]);
    await expect(page.getByTestId('cn-picked-photo')).toHaveCount(2);
    await page.getByTestId('cn-notice-input').setInputFiles(PDF('Sample notice 7.pdf'));
    await expect(page.getByText('Sample notice 7.pdf')).toBeVisible();
    await page.getByTestId('cn-save').click();
    await expect(page.getByTestId('log-row-CN-001')).toBeVisible();

    const viewer = viewerOf(page);
    const tiles = page.getByTestId('cn-photo');
    await expect(tiles).toHaveCount(2);
    await tiles.first().getByTestId('photo-open').click();
    await expect(viewer.getByTestId('viewer-count')).toHaveText('1 of 2');
    await expect(viewer.getByRole('img', { name: 'cn-a.jpg' })).toBeVisible();
    await viewer.getByTestId('viewer-next').click();
    await expect(viewer.getByRole('img', { name: 'cn-b.jpg' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);

    await page.getByTestId('cn-notice-view').click();
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample notice 7.pdf');
    await seesPdfThenEscape(page);
  });

  test('safety: the sign-in sheet and a talk PDF have View', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The same screens on the phone.');
    await page.goto('/');

    // A closed meeting's sheet.
    await openAs(page, 'pm', '/p/job-a/safety/mock-meeting-1');
    await page.getByTestId('safety-sheet-view').click();
    await seesPdfThenEscape(page);

    // A company topic with a PDF: View on the form, then on the talk.
    await openAs(page, 'safety', '/p/job-a/safety?view=library');
    await page.getByTestId('safety-new-topic').click();
    await page.getByTestId('safety-topic-category-equipment').click();
    await page.getByTestId('safety-topic-title').fill('Sample rigging');
    await page.getByTestId('safety-topic-points').fill('Inspect the slings first.');
    await page.getByTestId('safety-topic-pdf-input').setInputFiles(PDF('Sample rigging.pdf'));
    await expect(page.getByTestId('safety-topic-pdf-name')).toContainText('Sample rigging.pdf');
    await page.getByTestId('safety-topic-pdf-view').click();
    await seesPdfThenEscape(page);
    await page.getByTestId('safety-topic-save').click();
    await expect(page.getByTestId('safety-topic')).toContainText('Sample rigging');
    await page.getByTestId('safety-outline-view').click();
    await seesPdfThenEscape(page);
  });
});
