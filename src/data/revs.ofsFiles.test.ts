import { describe, expect, it } from 'vitest';
import { ofsFiles, ofsNumberOf, type OfsFileRow } from './revs.ofsFiles';

const row = (id: string, name: string, extra: Partial<OfsFileRow> = {}): OfsFileRow => ({
  id, original_name: name, mime: 'application/pdf', created_at: '2026-09-21T10:00:00Z', upload_complete: true, scan_status: 'clean', ...extra,
});

describe('the OFS number in a file name (rev_ofs_name_has)', () => {
  it('OFS_IR_0041 or _OFS_0041_, four digits, or five and more with no leading zero', () => {
    expect(ofsNumberOf('OFS_IR_0041_Attachment.pdf')).toBe(41);
    expect(ofsNumberOf('ofs_ir_0041.pdf')).toBe(41);
    expect(ofsNumberOf('Sample_OFS_0052_map.pdf')).toBe(52);
    expect(ofsNumberOf('OFS_IR_12345.pdf')).toBe(12345);
  });
  it('near misses carry none', () => {
    expect(ofsNumberOf('OFS_IR_00411.pdf')).toBeNull();
    expect(ofsNumberOf('OFS_IR_041.pdf')).toBeNull();
    expect(ofsNumberOf('OFS_IR_0000.pdf')).toBeNull();
    expect(ofsNumberOf('Sample OFS 0041.pdf')).toBeNull();
    expect(ofsNumberOf('A201A Floor Plan.pdf')).toBeNull();
  });
});

describe("the job's OFS IRs by number", () => {
  it('one per number, the rule\'s pick (an Attachment or an OFS_IR name, then the newest), highest number first', () => {
    const list = ofsFiles([
      row('a', 'OFS_IR_0041.pdf', { created_at: '2026-09-20T10:00:00Z' }),
      row('b', 'Sample_OFS_0041_map.pdf', { created_at: '2026-09-25T10:00:00Z' }),
      row('c', 'OFS_IR_0041_Attachment.pdf', { created_at: '2026-09-22T10:00:00Z' }),
      row('d', 'Sample_OFS_0052_scan.jpg', { mime: 'image/jpeg' }),
      row('e', 'OFS_IR_0007.pdf'),
    ]);
    expect(list).toEqual([
      { ofs: 52, fileId: 'd', name: 'Sample_OFS_0052_scan.jpg' },
      { ofs: 41, fileId: 'c', name: 'OFS_IR_0041_Attachment.pdf' },
      { ofs: 7, fileId: 'e', name: 'OFS_IR_0007.pdf' },
    ]);
  });
  it('leaves out what the rule would not link: unfinished, infected, not a PDF or a picture', () => {
    expect(
      ofsFiles([
        row('a', 'OFS_IR_0041.pdf', { upload_complete: false }),
        row('b', 'OFS_IR_0042.pdf', { scan_status: 'infected' }),
        row('c', 'OFS_IR_0043.docx', { mime: 'application/msword' }),
      ]),
    ).toEqual([]);
  });
});
