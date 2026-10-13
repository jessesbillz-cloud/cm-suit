import { describe, expect, it } from 'vitest';
import { sectionOfText } from './sectionOfText';

const BOOK = [{ section: '09 21 16' }, { section: '09 29 00' }, { section: '05 40 00' }];

describe('sectionOfText', () => {
  it('reads a submittal cover\'s Spec Section line', () => {
    const cover = 'SUBMITTAL TRANSMITTAL\nProject: Sample Hall\nSpec Section: 09 29 00\nDescription: Shop drawings\nDate: 10/12/2026\n';
    expect(sectionOfText(cover)).toBe('09 29 00');
  });

  it('reads the number however it is spaced, and a Level 4 under its 6 digits', () => {
    expect(sectionOfText('Specification Section No. 092900')).toBe('09 29 00');
    expect(sectionOfText('SECTION 09 21 16.13 - NON-STRUCTURAL FRAMING')).toBe('09 21 16');
    expect(sectionOfText('Spec   Section: 09 29 00')).toBe('09 29 00');
  });

  it("reads an RFI's Spec Section or Reference field", () => {
    expect(sectionOfText('RFI 012\nQuestion: board joint at head of wall\nReference: 09 29 00, A-501')).toBe('09 29 00');
    expect(sectionOfText('Reference: Sheet A-501, detail 4, 09 29 00')).toBe('09 29 00');
    expect(sectionOfText('Spec Section\n05 40 00\nDrawing\nS-201')).toBe('05 40 00');
  });

  it('takes a stronger label over a weaker one, and the book over both', () => {
    expect(sectionOfText('Ref: 07 92 00\nSpec Section: 09 29 00')).toBe('09 29 00');
    expect(sectionOfText('Spec Section: 07 92 00\nSection 09 29 00', BOOK)).toBe('09 29 00');
  });

  it('leaves out dates, phone numbers, longer numbers and Divisions past 49', () => {
    expect(sectionOfText('Date 2026 10 12\nPhone 760 555 1234\nJob 1092900\nSection 55 12 34')).toBeNull();
    expect(sectionOfText('Spec Section: 09.29.00')).toBeNull();
    expect(sectionOfText('Section 3.2 Products 1.5 6')).toBeNull();
  });

  it('takes an unlabeled number only when the book has it and it is the only one', () => {
    expect(sectionOfText('Sample Co shop drawings 09 29 00 sheet 2')).toBeNull();
    expect(sectionOfText('Sample Co shop drawings 09 29 00 sheet 2', BOOK)).toBe('09 29 00');
    expect(sectionOfText('Board 09 29 00 and framing 09 21 16', BOOK)).toBeNull();
  });

  it('answers null for a page with no text (a scan)', () => {
    expect(sectionOfText('')).toBeNull();
    expect(sectionOfText('\n\n')).toBeNull();
  });
});
