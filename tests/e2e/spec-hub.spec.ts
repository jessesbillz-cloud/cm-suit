// A spec section as the hub (Jesse, Oct 12: "as long as there's a search bar and you can search the spec section, or
// click a spec section and say show me all the RFIs and submittals associated with this"). The search at the top of
// Files shows the matching sections as boxes; a box opens the section's page with its submittals, RFIs and CCDs, and
// Open spec. The naming rule: a file going into Submittals with no spec section in its name is asked for one and goes
// up as "<section>_<their name>"; one already there gets Add spec section. A PDF whose first page names its section
// (0105) goes up without the question, its name as it was; a scan with no words is still asked. The PDFs are made in the
// test. Runs only against the e2e mock data layer.
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';

async function signIn(page: Page, who: string, path: string): Promise<void> {
  test.skip(test.info().project.name !== 'desktop', 'Uses the desktop sections card.');
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto(path);
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
}

async function dropFiles(page: Page, names: readonly string[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const name of list) dt.items.add(new File([new Uint8Array(1024)], name, { type: 'application/pdf' }));
    return dt;
  }, names);
  await page.getByTestId('files-drop').dispatchEvent('drop', { dataTransfer });
}

/**
 * A tiny synthetic one-page PDF: its lines as text (Helvetica), or, with none, only a filled box (a scan: no text).
 * Built here so no real job file is ever a fixture.
 */
function tinyPdf(lines: readonly string[]): number[] {
  const text = lines.map((l, i) => `${i === 0 ? '' : '0 -16 Td '}(${l}) Tj`).join(' ');
  const content = lines.length > 0 ? `BT /F1 12 Tf 72 720 Td ${text} ET` : '0.6 g 72 300 468 400 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${String(i + 1)} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Array.from({ length: out.length }, (_, i) => out.charCodeAt(i));
}

async function dropPdf(page: Page, name: string, lines: readonly string[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    (f) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: 'application/pdf' }));
      return dt;
    },
    { name, bytes: tinyPdf(lines) },
  );
  await page.getByTestId('files-drop').dispatchEvent('drop', { dataTransfer });
}

const section = (page: Page, name: string) =>
  page.getByTestId('section').filter({ has: page.getByTestId('section-name').getByText(name, { exact: true }) });

test.describe('spec section hub', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test("searching 0929 finds the section; its page lists its submittal and RFI, and opens the spec", async ({ page }) => {
    await signIn(page, 'pm', '/p/job-b/files');
    await dropFiles(page, ['RFI 012 - 09 29 00 Sample board joint.pdf']);
    await expect(page.getByRole('status').filter({ hasText: 'Sorted: 1 RFIs' })).toBeVisible();

    await page.getByTestId('spec-search').fill('0929');
    const boxes = page.getByTestId('spec-hub-box');
    await expect(boxes).toHaveCount(1);
    await expect(boxes.first()).toContainText('09 29 00');
    await expect(boxes.first()).toContainText('Gypsum Board');
    await expect(boxes.first().getByTestId('spec-hub-box-count')).toHaveText('2');
    await boxes.first().click();

    const heading = page.getByTestId('spec-hub-title');
    await expect(heading).toContainText('09 29 00');
    await expect(heading).toContainText('Gypsum Board');
    const submittals = page.getByTestId('spec-hub-submittals');
    await expect(submittals.getByTestId('spec-hub-count')).toHaveText('1');
    await expect(submittals.getByTestId('spec-hub-row')).toContainText('092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf');
    const rfis = page.getByTestId('spec-hub-rfis');
    await expect(rfis.getByTestId('spec-hub-row')).toContainText('RFI 012 - 09 29 00 Sample board joint.pdf');
    await expect(page.getByTestId('spec-hub-ccds')).toHaveCount(0);

    // Back returns to the boxes.
    await page.goBack();
    await expect(page.getByTestId('spec-hub-box')).toHaveCount(1);
    await page.goForward();

    await page.getByTestId('spec-hub-spec').click();
    const viewer = page.getByTestId('file-viewer');
    await expect(viewer.getByTestId('viewer-name')).toHaveText('Sample Project Manual B.pdf');
    await expect(viewer.getByTestId('viewer-page')).toHaveText('Page 3 of 3');
    // The book's section panel opens the same page.
    await viewer.getByTestId('spec-side').getByTestId('spec-hub-open').click();
    await expect(viewer).toHaveCount(0);
    await expect(page.getByTestId('spec-hub-title')).toContainText('09 29 00');
  });

  test('a file dropped into Submittals without a section is asked for one and named with it', async ({ page }) => {
    await signIn(page, 'pm', '/p/job-b/files');
    await section(page, 'Submittals').click();
    await expect(page.getByTestId('file-row')).toHaveCount(4);
    await dropFiles(page, ['Gypsum board shop drawings.pdf']);
    const prompt = page.getByTestId('section-prompt');
    await expect(prompt).toContainText('Gypsum board shop drawings.pdf');
    await expect(prompt.getByTestId('section-prompt-upload')).toBeDisabled();
    await prompt.getByTestId('section-prompt-input').fill('092900');
    await prompt.getByTestId('section-prompt-upload').click();
    await expect(prompt).toHaveCount(0);
    const row = page.getByTestId('file-row').filter({ hasText: 'Gypsum board shop drawings' });
    await expect(row.getByTestId('file-row-open')).toHaveAttribute('title', '092900_Gypsum board shop drawings.pdf');
    await expect(row).toContainText('09 29 00');
  });

  test('a bulk drop takes one section for all; a file already in Submittals gets Add spec section', async ({ page }) => {
    await signIn(page, 'pm', '/p/job-b/files');
    await section(page, 'Submittals').click();
    await dropFiles(page, ['Sample anchors.pdf', 'Sample clips.pdf']);
    const prompt = page.getByTestId('section-prompt');
    await expect(prompt.getByTestId('section-prompt-input')).toHaveCount(2);
    await prompt.getByTestId('section-prompt-same').check();
    await prompt.getByTestId('section-prompt-input').fill('05 40 00');
    await prompt.getByTestId('section-prompt-upload').click();
    for (const name of ['054000_Sample anchors.pdf', '054000_Sample clips.pdf']) {
      await expect(page.getByTestId('file-row-open').and(page.locator(`[title="${name}"]`))).toHaveCount(1);
    }

    await section(page, 'To sort').click();
    await page.getByTestId('file-row').filter({ hasText: 'Sample meeting notes.pdf' }).getByTestId('file-row-move').selectOption({ label: 'Submittals' });
    await section(page, 'Submittals').click();
    const row = page.getByTestId('file-row').filter({ hasText: 'Sample meeting notes' });
    await row.getByTestId('file-row-add-section').click();
    await row.getByTestId('file-row-section-input').fill('013100');
    await row.getByTestId('file-row-section-save').click();
    await expect(row.getByTestId('file-row-open')).toHaveAttribute('title', '013100_Sample meeting notes.pdf');
    await expect(row.getByTestId('file-row-add-section')).toHaveCount(0);
  });

  test('a PDF whose first page names its spec section goes up without the question and shows on that section\'s page', async ({ page }) => {
    await signIn(page, 'pm', '/p/job-b/files');
    await section(page, 'Submittals').click();
    await expect(page.getByTestId('file-row')).toHaveCount(4);
    await dropPdf(page, 'Shop drawings.pdf', ['SUBMITTAL TRANSMITTAL', 'Project: Sample Hall', 'Spec Section 09 29 00', 'Shop drawings']);
    const row = page.getByTestId('file-row').filter({ hasText: 'Shop drawings' });
    // The name stays as it was; the section is filed with the file and shows in its column.
    await expect(row.getByTestId('file-row-open')).toHaveAttribute('title', 'Shop drawings.pdf');
    await expect(row).toContainText('09 29 00');
    await expect(page.getByTestId('section-prompt')).toHaveCount(0);
    await expect(row.getByTestId('file-row-add-section')).toHaveCount(0);

    await page.getByTestId('spec-search').fill('0929');
    await page.getByTestId('spec-hub-box').first().click();
    await expect(page.getByTestId('spec-hub-title')).toContainText('09 29 00');
    await expect(page.getByTestId('spec-hub-submittals').getByTestId('spec-hub-row').filter({ hasText: 'Shop drawings.pdf' })).toHaveCount(1);
  });

  test('a scanned PDF with no words is still asked for its section', async ({ page }) => {
    await signIn(page, 'pm', '/p/job-b/files');
    await section(page, 'Submittals').click();
    await expect(page.getByTestId('file-row')).toHaveCount(4);
    await dropPdf(page, 'Sample scan.pdf', []);
    const prompt = page.getByTestId('section-prompt');
    await expect(prompt).toContainText('Sample scan.pdf');
    await prompt.getByTestId('section-prompt-input').fill('092900');
    await prompt.getByTestId('section-prompt-upload').click();
    const row = page.getByTestId('file-row').filter({ hasText: 'Sample scan' });
    await expect(row.getByTestId('file-row-open')).toHaveAttribute('title', '092900_Sample scan.pdf');
  });
});
