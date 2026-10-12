import { describe, expect, it } from 'vitest';
import { classifyUpload, mostOf, sortDrop } from './classify';

describe('where an upload goes by its name', () => {
  it('sorts each kind of name', () => {
    expect(classifyUpload('A201A Floor Plan Level 01 Area A.pdf')).toBe('plans');
    expect(classifyUpload('092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf')).toBe('submittals');
    expect(classifyUpload('S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf')).toBe('submittals');
    expect(classifyUpload('OFS_IR_0041.pdf')).toBe('reports');
    expect(classifyUpload('RFI 012 Door hardware.pdf')).toBe('rfis');
    expect(classifyUpload('Sample_RFI_013.pdf')).toBe('rfis');
    expect(classifyUpload('CCD 3 Sample change.pdf')).toBe('ccd');
    expect(classifyUpload('IMG_1234.jpg')).toBe('photos');
    expect(classifyUpload('Sample corridor.HEIC')).toBe('photos');
  });

  it('has no opinion on anything else, and never reads a word inside another', () => {
    expect(classifyUpload('11.pdf')).toBeNull();
    expect(classifyUpload('Sample Plan Set A.pdf')).toBeNull();
    expect(classifyUpload('Sample interfirm notes.pdf')).toBeNull();
    expect(classifyUpload('Sample Project Manual.pdf')).toBeNull();
  });

  it("takes a dropped folder's name first, the outermost one", () => {
    expect(classifyUpload('001.pdf', ['Approved Submittals', '092000 - Framing - Sample Co'])).toBe('submittals');
    expect(classifyUpload('092900 - Gypsum Board.pdf', ['Specifications'])).toBe('specs');
    expect(classifyUpload('Sample sheet.pdf', ['Drawings', 'Submittal markups'])).toBe('plans');
    expect(classifyUpload('Sample page.pdf', ['092000 - Framing - Sample Co'])).toBe('submittals');
  });

  it('keeps a spec section in Specs while Specs is open, never a submittal with its number', () => {
    expect(classifyUpload('092900 - Gypsum Board.pdf', [], 'specs')).toBe('specs');
    expect(classifyUpload('092900 - Gypsum Board.pdf', [], 'plans')).toBe('submittals');
    expect(classifyUpload('092900_04.0_Gypsum Board_PD_NET.pdf', [], 'specs')).toBe('submittals');
  });
});

describe('a drop', () => {
  const f = (name: string, dir: string[] = []) => ({ file: { name }, dir });

  it('goes where most point, a tie to the earlier section', () => {
    expect(mostOf(['plans', 'submittals', 'submittals', null])).toBe('submittals');
    expect(mostOf(['photos', 'plans'])).toBe('plans');
    expect(mostOf([null, null])).toBeNull();
  });

  it('sorts loose files each their own way and keeps a dropped folder together', () => {
    const trade = '092000 - Framing, Drywall, Exterior Finishes - Sample Drywall Co';
    const dropped = [
      f('A201A Floor Plan.pdf'),
      f('A202A Floor Plan.pdf'),
      f('Sample notes.pdf'),
      f('092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf', ['Approved', trade]),
      f('Sample cover sheet.pdf', ['Approved', trade]),
      f('072100_02.0_Thermal Insulation_PD_MCN.pdf', ['Approved', '072100 - Insulation - Sample Co']),
    ];
    const groups = sortDrop(dropped);
    expect(groups.map((g) => [g.kind, g.tree, g.intoSection, g.items.length])).toEqual([
      ['plans', false, false, 2],
      [null, false, false, 1],
      ['submittals', true, false, 3],
    ]);
    const named = sortDrop([f('092900_04.0_Gypsum Board_PD_NET.pdf', ['Approved Submittals', trade])]);
    expect(named.map((g) => [g.kind, g.intoSection])).toEqual([['submittals', true]]);
  });
});
