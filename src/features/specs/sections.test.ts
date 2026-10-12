import { describe, expect, it } from 'vitest';
import { bookWith, findSection, sectionAt, sectionDigits, sectionOfName, sectionRefs } from './sections';

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

  it("reads a submittal's section from its file name", () => {
    expect(sectionOfName('092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf')).toBe('09 29 00');
    expect(sectionOfName('S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf')).toBe('07 92 00');
    expect(sectionOfName('A201A Floor Plan Level 01 Area A.pdf')).toBeNull();
  });

  it('picks the newest book that has the section', () => {
    const book = (id: string, sections: string[]) => ({
      file_id: id,
      file_name: `${id}.pdf`,
      size: 1,
      page_count: 3,
      text_ready: true,
      can_send: false,
      sections: sections.map((section, i) => ({ section, title: '', first_page: i + 1, last_page: i + 1 })),
    });
    const older = book('old', ['09 29 00', '10 28 00']);
    const newer = book('new', ['09 29 00']);
    expect(bookWith([older, newer], '092900')?.book.file_id).toBe('new');
    expect(bookWith([older, newer], '10 28 00')?.section.first_page).toBe(2);
    expect(bookWith([older, newer], '07 92 00')).toBeNull();
  });
});
