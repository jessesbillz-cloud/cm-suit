import { describe, expect, it } from 'vitest';
import { findSection, sectionAt, sectionDigits, sectionRefs } from './sections';

const BOOK = [
  { section: '09 21 16', first_page: 4 },
  { section: '09 29 00', first_page: 9 },
  { section: '28 46 21.11', first_page: 30 },
];

describe('spec sections', () => {
  it('reads a number however it is spaced, and only Divisions 00 to 49', () => {
    expect(sectionDigits('09 21 16')).toBe('092116');
    expect(sectionDigits('092116')).toBe('092116');
    expect(sectionDigits('28 46 21.11')).toBe('28462111');
    expect(sectionDigits('55 12 34')).toBeNull();
    expect(sectionDigits('A-501')).toBeNull();
  });

  it('finds the same number, else its parent or child', () => {
    expect(findSection(BOOK, '092900')?.first_page).toBe(9);
    expect(findSection(BOOK, '09 21 16.13')?.first_page).toBe(4);
    expect(findSection(BOOK, '28 46 21')?.first_page).toBe(30);
    expect(findSection(BOOK, '10 28 00')).toBeNull();
  });

  it('says which section a page is in', () => {
    expect(sectionAt(BOOK, 1)).toBe(-1);
    expect(sectionAt(BOOK, 4)).toBe(0);
    expect(sectionAt(BOOK, 12)).toBe(1);
    expect(sectionAt(BOOK, 31)).toBe(2);
  });

  it('cuts free text into words and section numbers', () => {
    expect(sectionRefs('Spec 09 21 16, sheet A-501 and 072100')).toEqual([
      { text: 'Spec ' },
      { section: '09 21 16' },
      { text: ', sheet A-501 and ' },
      { section: '072100' },
    ]);
    expect(sectionRefs('Detail 5/A-501')).toEqual([{ text: 'Detail 5/A-501' }]);
    expect(sectionRefs('PO 991234')).toEqual([{ text: 'PO 991234' }]);
  });
});
