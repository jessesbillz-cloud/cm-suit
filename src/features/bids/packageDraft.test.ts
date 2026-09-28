import { describe, expect, it } from 'vitest';
import { divisionOfCode, packageDivisions, startingDivision, suggestCode } from './packageDraft';

const DIVISIONS = [
  { number: '00', title: 'Procurement and Contracting Requirements', reserved: false },
  { number: '01', title: 'General Requirements', reserved: false },
  { number: '09', title: 'Finishes', reserved: false },
  { number: '15', title: 'Reserved for Future Expansion', reserved: true },
  { number: '21', title: 'Fire Suppression', reserved: false },
];

describe('suggestCode', () => {
  it('starts a division at A', () => {
    expect(suggestCode('09', [])).toBe('09A');
    expect(suggestCode('09', ['03A', '07B'])).toBe('09A');
  });

  it('takes the letter after the highest one in the division', () => {
    expect(suggestCode('09', ['09A'])).toBe('09B');
    expect(suggestCode('09', ['09A', '09B', '03A', '10C'])).toBe('09C');
    expect(suggestCode('09', ['09A', '09D'])).toBe('09E');
  });

  it('fills a gap once Z is used, and gives up when all 26 are taken', () => {
    expect(suggestCode('09', ['09A', '09Z'])).toBe('09B');
    const all = Array.from({ length: 26 }, (_, i) => `09${String.fromCharCode(65 + i)}`);
    expect(suggestCode('09', all)).toBeNull();
  });

  it('ignores codes that are not a division plus a letter', () => {
    expect(suggestCode('09', ['09', '9A', '09AB', '09a'])).toBe('09A');
  });
});

describe('divisionOfCode', () => {
  it('reads the division of a code', () => {
    expect(divisionOfCode('09B')).toBe('09');
    expect(divisionOfCode('33B')).toBe('33');
    expect(divisionOfCode('09')).toBeNull();
    expect(divisionOfCode('09b')).toBeNull();
  });
});

describe('packageDivisions', () => {
  it('leaves out reserved divisions and 00', () => {
    expect(packageDivisions(DIVISIONS).map((d) => d.number)).toEqual(['01', '09', '21']);
  });
});

describe('startingDivision', () => {
  it('starts an empty job at 01 and a running one where its codes left off', () => {
    expect(startingDivision([], DIVISIONS)).toBe('01');
    expect(startingDivision(['01A', '09A'], DIVISIONS)).toBe('09');
  });

  it('skips reserved divisions', () => {
    expect(startingDivision(['14Z'], DIVISIONS)).toBe('21');
  });
});
