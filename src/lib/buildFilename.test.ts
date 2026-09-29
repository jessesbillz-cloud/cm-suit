import { describe, expect, it } from 'vitest';
import { buildFilename } from './buildFilename';

const values = { number: 7, date: '2026-09-05', fields: { Project: 'Sample Job A', Author: 'Pat Q' } };

describe('buildFilename', () => {
  it('builds the standard daily report name', () => {
    expect(buildFilename('Daily Report {#} {Project} {MM-DD-YYYY}.pdf', values)).toBe(
      'Daily Report 7 Sample Job A 09-05-2026.pdf',
    );
  });
  it('zero-pads to the count of #', () => {
    expect(buildFilename('IR {###}', values)).toBe('IR 007');
    expect(buildFilename('IR {##}', { number: 123 })).toBe('IR 123');
  });
  it('supports several date shapes', () => {
    expect(buildFilename('{YYYY-MM-DD}', values)).toBe('2026-09-05');
    expect(buildFilename('{MM.DD.YY}', values)).toBe('09.05.26');
    expect(buildFilename('{M-D-YYYY}', values)).toBe('9-5-2026');
  });
  it('matches field names case-insensitively as a fallback', () => {
    expect(buildFilename('{project} - {AUTHOR}', values)).toBe('Sample Job A - Pat Q');
  });
  it('{Name_} puts underscores for spaces (the VIS form\'s DR_{#}_{Project_}_{YYYY-MM-DD})', () => {
    expect(buildFilename('DR_{#}_{Project_}_{YYYY-MM-DD}', { ...values, number: 233 })).toBe('DR_233_Sample_Job_A_2026-09-05');
    expect(buildFilename('{project_}', { fields: { Project: '  Two  Words ' } })).toBe('Two_Words');
    expect(() => buildFilename('{Missing_}', values)).toThrow(/Missing_/);
  });
  it('removes characters that break filenames', () => {
    expect(buildFilename('{Project}', { fields: { Project: 'A/B: "C"' } })).toBe('A-B- -C-');
  });
  it('throws when a value is missing instead of cutting the name short', () => {
    expect(() => buildFilename('Report {#}', {})).toThrow(/number/);
    expect(() => buildFilename('{Project} {MM-DD-YYYY}', { fields: { Project: 'X' } })).toThrow(/date/);
    expect(() => buildFilename('{Missing}', values)).toThrow(/Missing/);
  });
});
