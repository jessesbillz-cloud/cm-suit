import { describe, expect, it } from 'vitest';
import { bySheet, bySubmittal, companyOf, parseSheet, parseSubmittal, stripExt } from './fileNames';

describe('a plan sheet in its name', () => {
  it('reads the sheet number and the title', () => {
    expect(parseSheet('A201A Floor Plan Level 01 Area A.pdf')).toEqual({ sheet: 'A201A', title: 'Floor Plan Level 01 Area A' });
    expect(parseSheet('a201a_Floor Plan rev 2.pdf')).toEqual({ sheet: 'A201A', title: 'Floor Plan rev 2' });
    expect(parseSheet('A201-Key Plan.pdf')).toEqual({ sheet: 'A201', title: 'Key Plan' });
    expect(parseSheet('FP101.1 Fire Sprinkler Plan.pdf')).toEqual({ sheet: 'FP101.1', title: 'Fire Sprinkler Plan' });
    expect(parseSheet('S-501.pdf')).toEqual({ sheet: 'S-501', title: '' });
  });

  it('leaves names without one alone', () => {
    for (const name of ['11.pdf', 'Sample Plan Set A.pdf', 'A201AB Enlarged.pdf', 'RFI 012.pdf', 'IMG_1234.jpg', 'OFS_IR_0041.pdf',
      'S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf', '092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf']) {
      expect(parseSheet(name)).toBeNull();
    }
  });

  it('sorts by sheet number, names without one after', () => {
    const names = ['Sample Plan Set A.pdf', 'A201A Floor Plan.pdf', 'A101 Site.pdf', 'A201 Floor Plan.pdf', '11.pdf', 'A-102 Key.pdf'];
    expect([...names].sort(bySheet)).toEqual([
      'A101 Site.pdf', 'A-102 Key.pdf', 'A201 Floor Plan.pdf', 'A201A Floor Plan.pdf', '11.pdf', 'Sample Plan Set A.pdf',
    ]);
  });
});

describe('a submittal in its name', () => {
  it('reads the section, number, title and stamp', () => {
    expect(parseSubmittal('092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf')).toEqual({
      section: '09 29 00', no: '04.0', title: 'Gypsum Board PD Acoustic Sealant', stamp: 'NET',
    });
    expect(parseSubmittal('072100_02.0_Thermal Insulation_PD_MCN.pdf')).toEqual({
      section: '07 21 00', no: '02.0', title: 'Thermal Insulation PD', stamp: 'MCN',
    });
    expect(parseSubmittal('092400_02.0_Exterior Portland Cement Plaster_PD_MCN RNR.pdf')).toEqual({
      section: '09 24 00', no: '02.0', title: 'Exterior Portland Cement Plaster PD', stamp: 'MCN RNR',
    });
    expect(parseSubmittal('054000_03.1_Cold Formed Metal Framing_Welding Procedure UES Review.pdf')).toEqual({
      section: '05 40 00', no: '03.1', title: 'Cold Formed Metal Framing Welding Procedure UES Review', stamp: null,
    });
  });

  it('reads the older form too', () => {
    expect(parseSubmittal('S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf')).toEqual({
      section: '07 92 00', no: '0147.0', title: 'Joint Sealants PD XYZ', stamp: 'AAN',
    });
  });

  it('reads a section with no number, and leaves other names alone', () => {
    expect(parseSubmittal('092900 - Gypsum Board.pdf')).toEqual({ section: '09 29 00', no: null, title: 'Gypsum Board', stamp: null });
    expect(parseSubmittal('A201A Floor Plan.pdf')).toBeNull();
    expect(parseSubmittal('Sample notes.pdf')).toBeNull();
  });

  it('sorts by section, then number', () => {
    const names = [
      'Sample notes.pdf',
      '092900_04.0_Gypsum Board_PD_NET.pdf',
      '072100_02.0_Thermal Insulation_PD_MCN.pdf',
      '092900_10.0_Gypsum Board_SD_NET.pdf',
      'S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf',
    ];
    expect([...names].sort(bySubmittal)).toEqual([
      '072100_02.0_Thermal Insulation_PD_MCN.pdf',
      'S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf',
      '092900_04.0_Gypsum Board_PD_NET.pdf',
      '092900_10.0_Gypsum Board_SD_NET.pdf',
      'Sample notes.pdf',
    ]);
  });
});

describe('the rest', () => {
  it("takes a trade folder's company from the end of its name", () => {
    expect(companyOf('092000 - Framing, Drywall, Exterior Finishes - Sample Drywall Co')).toBe('Sample Drywall Co');
    expect(companyOf('081000 - Doors Frames Hardware - Sample Door Co')).toBe('Sample Door Co');
    expect(companyOf('Sample folder')).toBe('Sample folder');
  });

  it('takes the extension off, never a number', () => {
    expect(stripExt('A201.pdf')).toBe('A201');
    expect(stripExt('FP101.1')).toBe('FP101.1');
    expect(stripExt('092900_04.0_Board')).toBe('092900_04.0_Board');
  });
});
