import { describe, expect, it } from 'vitest';
import { guessPackage } from './guessPackage';

const PACKAGES = [
  { id: 'p-09b', code: '09B' },
  { id: 'p-03a', code: '03A' },
  { id: 'p-09a', code: '09A' },
];

describe('guessPackage', () => {
  it('reads the leading division and picks the first package by code', () => {
    expect(guessPackage('09_21050_RSA_Sample Drywall_2024_11_15.pdf', PACKAGES)).toBe('p-09a');
    expect(guessPackage('09-Sample Drywall.pdf', PACKAGES)).toBe('p-09a');
    expect(guessPackage('09 Sample Drywall.pdf', PACKAGES)).toBe('p-09a');
    expect(guessPackage('03.Sample Concrete.pdf', PACKAGES)).toBe('p-03a');
  });
  it('prefers a full code when that package exists', () => {
    expect(guessPackage('09B_Sample Ceilings.pdf', PACKAGES)).toBe('p-09b');
    expect(guessPackage('09c_Sample Flooring.pdf', PACKAGES)).toBe('p-09a');
  });
  it('gives up without a leading division or a matching package', () => {
    expect(guessPackage('Sample Drywall bid.pdf', PACKAGES)).toBeNull();
    expect(guessPackage('21050 Sample.pdf', PACKAGES)).toBeNull();
    expect(guessPackage('26_Sample Electrical.pdf', PACKAGES)).toBeNull();
    expect(guessPackage('09_Sample.pdf', [])).toBeNull();
  });
});
