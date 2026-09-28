import { describe, expect, it } from 'vitest';
import { searchSections, sectionsLine } from './csi';

const S = [
  { number: '09 29 00', division: '09', title: 'Gypsum Board' },
  { number: '09 21 16', division: '09', title: 'Gypsum Board Assemblies' },
  { number: '09 22 16', division: '09', title: 'Non-Structural Metal Framing' },
  { number: '09 91 23', division: '09', title: 'Interior Painting' },
  { number: '05 40 00', division: '05', title: 'Cold-Formed Metal Framing' },
  { number: '21 13 13', division: '21', title: 'Wet-Pipe Sprinkler Systems' },
];

const numbers = (rows: readonly { number: string }[]) => rows.map((r) => r.number);

describe('searchSections', () => {
  it('lists the division in number order when nothing is typed', () => {
    expect(numbers(searchSections(S, '', '09'))).toEqual(['09 21 16', '09 22 16', '09 29 00', '09 91 23']);
    expect(numbers(searchSections(S, '  ', null))).toHaveLength(6);
  });

  it('matches typed digits against the number however they are spaced', () => {
    expect(numbers(searchSections(S, '0921', null))).toEqual(['09 21 16']);
    expect(numbers(searchSections(S, '09 2', null))).toEqual(['09 21 16', '09 22 16', '09 29 00']);
    expect(numbers(searchSections(S, '092116', null))).toEqual(['09 21 16']);
  });

  it('puts numbers that start with the digits before numbers that only contain them', () => {
    expect(numbers(searchSections(S, '2116', null))).toEqual(['09 21 16']);
    expect(numbers(searchSections(S, '21', null))).toEqual(['21 13 13', '09 21 16']);
  });

  it('matches title words by their start, in any case', () => {
    expect(numbers(searchSections(S, 'gyp', null))).toEqual(['09 21 16', '09 29 00']);
    expect(numbers(searchSections(S, 'Metal FRAM', null))).toEqual(['05 40 00', '09 22 16']);
    expect(numbers(searchSections(S, 'wet pipe', null))).toEqual(['21 13 13']);
  });

  it('falls back to text anywhere in the title', () => {
    expect(numbers(searchSections(S, 'ypsum bo', null))).toEqual(['09 21 16', '09 29 00']);
  });

  it('keeps to the division unless asked to search all', () => {
    expect(numbers(searchSections(S, 'metal framing', '09'))).toEqual(['09 22 16']);
    expect(numbers(searchSections(S, 'sprinkler', '09'))).toEqual([]);
    expect(numbers(searchSections(S, 'sprinkler', null))).toEqual(['21 13 13']);
  });

  it('mixes a number part and a word', () => {
    expect(numbers(searchSections(S, '09 painting', null))).toEqual(['09 91 23']);
  });

  it('finds nothing for nonsense', () => {
    expect(searchSections(S, 'zzz', null)).toEqual([]);
    expect(searchSections(S, '77', null)).toEqual([]);
  });
});

describe('sectionsLine', () => {
  it('joins up to four numbers and counts the rest', () => {
    expect(sectionsLine([])).toBe('');
    expect(sectionsLine(['09 21 16'])).toBe('09 21 16');
    expect(sectionsLine(['09 21 16', '09 22 16', '09 29 00'])).toBe('09 21 16 · 09 22 16 · 09 29 00');
    expect(sectionsLine(['01 11 00', '01 21 00', '01 23 00', '01 31 00', '01 33 00', '01 50 00'])).toBe(
      '01 11 00 · 01 21 00 · 01 23 00 · 01 31 00 +2',
    );
  });
});
