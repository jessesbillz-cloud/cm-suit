import { describe, expect, it } from 'vitest';
import { classifyUpload, mostOf, sortDrop, type SectionKind } from './classify';

/** On a DSA job (it has CCDs). */
const onDsa = (name: string, dir: readonly string[] = [], viewing?: SectionKind) => classifyUpload(name, dir, viewing, true);
/** On a job that is not DSA (a CSU job: no CCDs, 0111). */
const onCsu = (name: string, dir: readonly string[] = [], viewing?: SectionKind) => classifyUpload(name, dir, viewing, false);

describe('where an upload goes by its name', () => {
  it('sorts each kind of name', () => {
    expect(onDsa('A201A Floor Plan Level 01 Area A.pdf')).toBe('plans');
    expect(onDsa('092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf')).toBe('submittals');
    expect(onDsa('S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf')).toBe('submittals');
    expect(onDsa('OFS_IR_0041.pdf')).toBe('reports');
    expect(onDsa('RFI 012 Door hardware.pdf')).toBe('rfis');
    expect(onDsa('Sample_RFI_013.pdf')).toBe('rfis');
    expect(onDsa('RFI_012.pdf')).toBe('rfis');
    expect(onDsa('RFI 12 response.pdf')).toBe('rfis');
    expect(onDsa('Sample Hall - RFI-034.pdf')).toBe('rfis');
    expect(onDsa('RFI012.pdf')).toBe('rfis');
    expect(onDsa('rfi 7 sample.PDF')).toBe('rfis');
    expect(onDsa('A101 RFI 12 sketch.pdf')).toBe('rfis');
    expect(onDsa('092900 RFI 12 response.pdf')).toBe('rfis');
    expect(onDsa('CCD 3 Sample change.pdf')).toBe('ccd');
    expect(onDsa('IMG_1234.jpg')).toBe('photos');
    expect(onDsa('Sample corridor.HEIC')).toBe('photos');
  });

  it('has no opinion on anything else, and never reads a word inside another', () => {
    expect(onDsa('11.pdf')).toBeNull();
    expect(onDsa('Sample Plan Set A.pdf')).toBeNull();
    expect(onDsa('Sample interfirm notes.pdf')).toBeNull();
    expect(onDsa('Sample Carfield notes.pdf')).toBeNull();
    expect(onDsa('Smurfit board.pdf')).toBeNull();
    expect(onDsa('Sample Project Manual.pdf')).toBeNull();
  });

  it("takes a dropped folder's name first, the outermost one", () => {
    expect(onDsa('001.pdf', ['Approved Submittals', '092000 - Framing - Sample Co'])).toBe('submittals');
    expect(onDsa('092900 - Gypsum Board.pdf', ['Specifications'])).toBe('specs');
    expect(onDsa('Sample sheet.pdf', ['Drawings', 'Submittal markups'])).toBe('plans');
    expect(onDsa('Sample page.pdf', ['092000 - Framing - Sample Co'])).toBe('submittals');
  });

  it('keeps a spec section in Specs while Specs is open, never a submittal with its number', () => {
    expect(onDsa('092900 - Gypsum Board.pdf', [], 'specs')).toBe('specs');
    expect(onDsa('092900 - Gypsum Board.pdf', [], 'plans')).toBe('submittals');
    expect(onDsa('092900_04.0_Gypsum Board_PD_NET.pdf', [], 'specs')).toBe('submittals');
    expect(onDsa('092900_04.0_Board per RFI 12_PD_NET.pdf')).toBe('submittals');
  });
});

describe('CCDs on a job that is not DSA (Jesse, Oct 23: "No CCDs on a CSU job, DSA only")', () => {
  it('sends what names a CCD to To sort, never a CCDs section', () => {
    expect(onCsu('CCD 3 Sample change.pdf')).toBe('unsorted');
    expect(onCsu('Sample CCDs 1-4.pdf', [], 'plans')).toBe('unsorted');
    expect(onCsu('Sample change.pdf', ['CCDs'])).toBe('unsorted');
    expect(onCsu('Sample change.pdf', ['Sample Hall', 'CCD 3'])).toBe('unsorted');
  });

  it('sorts everything else as on a DSA job', () => {
    expect(onCsu('A201A Floor Plan Level 01 Area A.pdf')).toBe('plans');
    expect(onCsu('RFI 012 Door hardware.pdf')).toBe('rfis');
    expect(onCsu('092900 CCD 3 response.pdf')).toBe('submittals');
    expect(onCsu('Sample notes.pdf')).toBeNull();
  });

  it('keeps a dropped CCD folder together in To sort, its own folder kept', () => {
    const f = (name: string, dir: string[] = []) => ({ file: { name }, dir });
    const groups = sortDrop([f('CCD 3 Sample change.pdf'), f('Sample change.pdf', ['CCDs']), f('Sample letter.pdf', ['CCDs'])], 'plans', false);
    expect(groups.map((g) => [g.kind, g.tree, g.intoSection, g.items.length])).toEqual([
      ['unsorted', false, false, 1],
      ['unsorted', true, false, 2],
    ]);
    expect(sortDrop([f('CCD 3 Sample change.pdf')], 'plans', true).map((g) => g.kind)).toEqual(['ccd']);
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
    const groups = sortDrop(dropped, undefined, true);
    expect(groups.map((g) => [g.kind, g.tree, g.intoSection, g.items.length])).toEqual([
      ['plans', false, false, 2],
      [null, false, false, 1],
      ['submittals', true, false, 3],
    ]);
    const named = sortDrop([f('092900_04.0_Gypsum Board_PD_NET.pdf', ['Approved Submittals', trade])], undefined, true);
    expect(named.map((g) => [g.kind, g.intoSection])).toEqual([['submittals', true]]);
  });
});
