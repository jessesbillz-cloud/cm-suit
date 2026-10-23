// The fire marshal's review (migration 0106, Jesse Oct 22): the job's designated person uploads a submittal and an RFI
// document from the job's start page (both go to OFS marked fire / life safety); an RFI document uploaded in Files without
// the mark never reaches him. The fire marshal sees exactly those two in For review, approves the submittal and marks the
// RFI Not approved with a comment; the designated person sees both under Back from OFS (with the OFS requests sent to
// OFS, waiting or inspected). On a phone the three boxes stack.
// Runs only against the e2e mock data layer: 'pm' sends the job's OFS requests (ir.decide in the mock), 'ahj' reviews.
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { expect, test, type Page } from '@playwright/test';

const MOCK = process.env['VITE_E2E_MOCK'] === 'true';
const JOB = 'job-s';
const SUBMITTAL = '211313_01.0_Sample Sprinkler Shop Drawings_NET.pdf';
const RFI_DOC = 'RFI 020 - 28 31 00 Sample alarm response.pdf';
const UNMARKED = 'RFI 021 Sample door response.pdf';

/** A synthetic PDF's bytes (a header and nothing real). */
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF\n`) });

async function as(page: Page, who: string, path: string): Promise<void> {
  // A later init script wins: the same tab (and its mock state) as someone else.
  await page.addInitScript((w: string) => {
    window.localStorage.setItem('e2e-mock-user', w);
  }, who);
  await page.goto(path);
}

const group = (page: Page, id: string) => page.locator(`[data-testid="ofs-group"][data-group="${id}"]`);
const countOf = (page: Page, id: string) => group(page, id).getByTestId('ofs-group-count').first();

test.describe('the fire marshal reviews fire / life safety items', () => {
  test.skip(!MOCK, 'Runs only against the e2e mock data layer. Set VITE_E2E_MOCK=true to run it.');

  test('uploaded from the start page, reviewed in For review, back on the start page', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'Walks the desktop frame; the phone test below checks the boxes.');
    await as(page, 'pm', `/p/${JOB}/board`);
    const desk = page.getByTestId('ofs-desk');
    await expect(desk).toBeVisible();
    await expect(page.getByTestId('ofs-desk-submittal')).toBeEnabled();
    await page.getByTestId('ofs-desk-submittal-input').setInputFiles(pdf(SUBMITTAL));
    await expect(page.getByTestId('ofs-desk-rfi')).toBeEnabled();
    await page.getByTestId('ofs-desk-rfi-input').setInputFiles(pdf(RFI_DOC));
    // Waiting on OFS: the two, beside the OFS requests already sent.
    await group(page, 'waiting').getByTestId('ofs-group-head').first().click();
    await expect(countOf(page, 'waiting/submittals')).toHaveText('1');
    await expect(countOf(page, 'waiting/rfis')).toHaveText('1');
    await expect(group(page, 'waiting/inspections')).toBeVisible();

    // An RFI document dropped in Files goes to RFIs without the mark.
    await page.goto(`/p/${JOB}/files`);
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
    const drop = await page.evaluateHandle((name) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(512)], name, { type: 'application/pdf' }));
      return dt;
    }, UNMARKED);
    await page.getByTestId('files-drop').dispatchEvent('drop', { dataTransfer: drop });
    await expect(page.getByRole('status').filter({ hasText: 'Sorted: 1 RFIs' })).toBeVisible();

    // The fire marshal: For review leads his home, and holds exactly the two marked ones.
    await as(page, 'ahj', '/all/board');
    await expect(page.getByTestId('home-review-count')).toHaveText('2');
    await page.goto(`/p/${JOB}/review`);
    const rows = page.getByTestId('ofs-row');
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('ofs-review')).not.toContainText(UNMARKED);
    await expect(countOf(page, 'waiting')).toHaveText('2');
    await expect(group(page, 'waiting/submittals/211313').getByTestId('ofs-group-head')).toContainText('21 13 13');

    await rows.filter({ hasText: SUBMITTAL }).click();
    await page.getByTestId('ofs-approve').click();
    await expect(page.getByTestId('ofs-decision')).toHaveAttribute('data-decision', 'approved');
    await expect(page.getByTestId('ofs-decision')).toContainText('OFS: Approved');

    await page.getByTestId('ofs-row').filter({ hasText: RFI_DOC }).click();
    await page.getByTestId('ofs-comment').fill('Sample: move the device down 6 inches.');
    await page.getByTestId('ofs-not-approve').click();
    await expect(page.getByTestId('ofs-decision')).toHaveAttribute('data-decision', 'not_approved');
    await expect(page.getByTestId('ofs-decision-comment')).toHaveText('Sample: move the device down 6 inches.');

    await expect(countOf(page, 'waiting')).toHaveText('0');
    await expect(countOf(page, 'done')).toHaveText('2');

    // The designated person: both back from OFS.
    await as(page, 'pm', `/p/${JOB}/board`);
    await expect(group(page, 'back')).toBeVisible();
    await group(page, 'back').getByTestId('ofs-group-head').first().click();
    await expect(countOf(page, 'back/approved')).toHaveText('1');
    await expect(countOf(page, 'back/not_approved')).toHaveText('1');
    await group(page, 'back/not_approved').getByTestId('ofs-group-head').click();
    await page.getByTestId('ofs-desk-row').filter({ hasText: RFI_DOC }).click();
    await expect(page.getByTestId('ofs-decision')).toContainText('Sample: move the device down 6 inches.');
  });

  test('on a phone the three boxes stack', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'The phone layout.');
    await as(page, 'pm', `/p/${JOB}/board`);
    const request = page.getByTestId('ofs-desk-request');
    const submittal = page.getByTestId('ofs-desk-submittal');
    const rfi = page.getByTestId('ofs-desk-rfi');
    await expect(rfi).toBeVisible();
    const [a, b, c] = await Promise.all([request.boundingBox(), submittal.boundingBox(), rfi.boundingBox()]);
    expect(a && b && c).toBeTruthy();
    if (a && b && c) {
      expect(b.y).toBeGreaterThan(a.y + a.height - 1);
      expect(c.y).toBeGreaterThan(b.y + b.height - 1);
    }
  });
});
