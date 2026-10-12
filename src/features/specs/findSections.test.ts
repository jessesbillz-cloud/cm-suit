import { describe, expect, it } from 'vitest';
import { findSections } from './findSections';

const BOOK = [
  { section: '09 21 16', title: 'Gypsum Board Assemblies', first_page: 4 },
  { section: '09 29 00', title: 'Gypsum Board', first_page: 9 },
  { section: '10 28 00', title: 'Toilet Accessories', first_page: 14 },
  { section: '21 13 13', title: 'Wet-Pipe Sprinkler Systems', first_page: 20 },
];
const TITLES: Record<string, string> = { '09': 'Finishes', '10': 'Specialties', '21': 'Fire Suppression' };
const title = (d: string) => TITLES[d] ?? null;
const shown = (query: string) => findSections(BOOK, query, title).groups.map((g) => [g.division, g.sections.map((s) => s.section)]);

describe('finding a spec section', () => {
  it('shows every section by division when nothing is typed', () => {
    const found = findSections(BOOK, '  ', title);
    expect(found.groups.map((g) => `${g.division} ${g.title}`)).toEqual(['09 Finishes', '10 Specialties', '21 Fire Suppression']);
    expect(found.groups[0]?.sections.map((s) => s.index)).toEqual([0, 1]);
    expect(found.first).toBeNull();
  });

  it('finds a number however it is typed', () => {
    for (const q of ['0929', '09 29', '092900', '09.29', '09 29 00']) {
      expect(shown(q)).toEqual([['09', ['09 29 00']]]);
      expect(findSections(BOOK, q, title).first?.first_page).toBe(9);
    }
  });

  it('a division number shows its sections, and digits anywhere in the number match', () => {
    expect(shown('09')).toEqual([['09', ['09 21 16', '09 29 00']]]);
    expect(shown('2800')).toEqual([['10', ['10 28 00']]]);
  });

  it('Enter goes to a number that starts with what was typed before one that only contains it', () => {
    expect(shown('21')).toEqual([
      ['09', ['09 21 16']],
      ['21', ['21 13 13']],
    ]);
    expect(findSections(BOOK, '21', title).first?.section).toBe('21 13 13');
  });

  it("matches words in the title or the division's title, every word", () => {
    expect(shown('gypsum')).toEqual([['09', ['09 21 16', '09 29 00']]]);
    expect(shown('Finishes')).toEqual([['09', ['09 21 16', '09 29 00']]]);
    expect(shown('board 29')).toEqual([['09', ['09 29 00']]]);
    expect(findSections(BOOK, 'toilet', title).first?.index).toBe(2);
    expect(shown('roofing')).toEqual([]);
  });

  it('a division without a known title has an empty title', () => {
    expect(findSections(BOOK, '10', () => null).groups[0]?.title).toBe('');
  });
});
