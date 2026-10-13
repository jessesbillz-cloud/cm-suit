import { describe, expect, it } from 'vitest';
import type { DroppedFile } from './collectDrop';
import { applySections, typedSection, unnamedSubmittals } from './submittalNames';

const drop = (name: string, dir: string[] = []): DroppedFile => ({ file: new File(['x'], name, { type: 'application/pdf' }), dir });

describe('the Submittals naming rule', () => {
  it('asks only for files landing in Submittals with no section in their names', () => {
    const dropped = [
      drop('Gypsum board shop drawings.pdf'),
      drop('092900_04.0_Sample Board_PD_NET.pdf'),
      drop('Sample Co 079200 sealant data.pdf'),
      drop('A201 Sample Plan.pdf'),
      drop('RFI 014 Sample.pdf'),
      drop('Sample anchors.pdf', ['092000 - Framing - Sample Co']),
    ];
    expect(unnamedSubmittals(dropped, 'submittals')).toEqual([
      { at: 0, name: 'Gypsum board shop drawings.pdf', offered: '' },
      { at: 5, name: 'Sample anchors.pdf', offered: '092000' },
    ]);
    // Elsewhere, a loose file without a section goes where the person is looking: nothing to ask.
    expect(unnamedSubmittals([drop('Gypsum board shop drawings.pdf')], 'plans')).toEqual([]);
    expect(unnamedSubmittals([drop('Sample notes.pdf', ['Approved Submittals'])], 'plans')).toEqual([{ at: 0, name: 'Sample notes.pdf', offered: '' }]);
  });

  it('reads the typed section and renames with it, the words kept', () => {
    expect(typedSection('092900')).toBe('092900');
    expect(typedSection(' 09 29 00 ')).toBe('092900');
    expect(typedSection('0929')).toBeNull();
    expect(typedSection('55 12 34')).toBeNull();
    const out = applySections([drop('Gypsum board shop drawings.pdf'), drop('Other.pdf')], new Map([[0, '092900']]));
    expect(out.map((d) => d.file.name)).toEqual(['092900_Gypsum board shop drawings.pdf', 'Other.pdf']);
    expect(out[0]?.file.type).toBe('application/pdf');
  });
});
