import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { stampSignature } from './stamp';

// A 1x1 transparent PNG (synthetic).
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

describe('stampSignature', () => {
  it('returns a valid PDF with the same page count', async () => {
    const src = await PDFDocument.create();
    src.addPage([612, 792]);
    src.addPage([612, 792]);
    const out = await stampSignature(await src.save(), {
      signaturePng: PNG_1PX,
      name: 'Pat Sample',
      signedAtLabel: 'Sep 26, 2026 4:05 PM PDT',
    });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
    expect(out.length).toBeGreaterThan(0);
  });
  it('refuses a PDF with no pages', async () => {
    const empty = await PDFDocument.create();
    // pdf-lib adds a blank page on save unless told not to.
    const bytes = await empty.save({ addDefaultPage: false });
    await expect(
      stampSignature(bytes, { signaturePng: PNG_1PX, name: 'X', signedAtLabel: 'Y' }),
    ).rejects.toThrow(/no pages/);
  });
});
