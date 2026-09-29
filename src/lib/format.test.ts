import { describe, expect, it } from 'vitest';
import { humanize } from './format';

describe('humanize', () => {
  it('turns keys into labels and keeps trade acronyms in capitals', () => {
    expect(humanize('ir_results')).toBe('IR results');
    expect(humanize('rfi.answered')).toBe('RFI answered');
    expect(humanize('file_uploaded')).toBe('File uploaded');
    expect(humanize('correction.signed_off')).toBe('Correction signed off');
    expect(humanize('pm')).toBe('PM');
  });
});
