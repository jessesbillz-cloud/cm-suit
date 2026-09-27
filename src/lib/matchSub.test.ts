import { describe, expect, it } from 'vitest';
import { matchSub, normalizeCompany } from './matchSub';

const SUBS = [
  { id: 's-drywall', company: 'Sample Drywall Co., Inc.' },
  { id: 's-concrete', company: 'Sample Concrete LLC' },
  { id: 's-electric', company: 'ABC Electric' },
  { id: 's-plumbing', company: 'ABC Plumbing' },
];

describe('normalizeCompany', () => {
  it('lower-cases, drops punctuation and trailing company words', () => {
    expect(normalizeCompany('Sample Drywall Co., Inc.')).toBe('sample drywall');
    expect(normalizeCompany('THE SAMPLE CORPORATION')).toBe('the sample');
    expect(normalizeCompany('Co')).toBe('co');
  });
});

describe('matchSub', () => {
  it('matches the same company however it is written', () => {
    expect(matchSub('sample drywall', SUBS)?.id).toBe('s-drywall');
    expect(matchSub('Sample Drywall, Inc', SUBS)?.id).toBe('s-drywall');
    expect(matchSub('Sample Concrete', SUBS)?.id).toBe('s-concrete');
  });
  it('accepts a prefix only when exactly one sub fits', () => {
    expect(matchSub('Sample Drywall Systems', SUBS)?.id).toBe('s-drywall');
    expect(matchSub('ABC', SUBS)).toBeNull();
    expect(matchSub('Sample', SUBS)).toBeNull();
  });
  it('leaves unknown or empty names unlinked', () => {
    expect(matchSub(null, SUBS)).toBeNull();
    expect(matchSub('  ', SUBS)).toBeNull();
    expect(matchSub('Other Framing', SUBS)).toBeNull();
    expect(matchSub('Sample Drywall', [])).toBeNull();
  });
});
