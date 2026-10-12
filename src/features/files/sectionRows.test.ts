import { describe, expect, it } from 'vitest';
import type { FileRow } from '../../data/types';
import { sectionRows } from './sectionRows';

const file = (id: string, folder: string, name: string): FileRow => ({
  id,
  project_id: 'p',
  folder_id: folder,
  original_name: name,
  mime: 'application/pdf',
  size: 1,
  scan_status: 'clean',
  upload_complete: true,
  created_at: '2026-10-11T16:00:00Z',
  created_by: 'u',
});
const folder = (id: string, parent: string | null, name: string) => ({ id, parent_id: parent, name, person: null, app_only: false });
const FOLDERS = [folder('subs', null, 'Submittals'), folder('t1', 'subs', '092000 - Framing - Sample Drywall Co'), folder('t2', 'subs', '072100 - Insulation - Sample Co')];
const SUBS = { kind: 'submittals', folder_id: 'subs', file_count: 3, folder_ids: ['subs', 't1', 't2'] };
const FILES = [
  file('a', 't1', '092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf'),
  file('b', 't2', '072100_02.0_Thermal Insulation_PD_MCN.pdf'),
  file('c', 'subs', 'Sample cover.pdf'),
];

describe("a section's list", () => {
  it('is every file in the section, submittals by section then number, each with its company', () => {
    const rows = sectionRows(FILES, 'submittals', SUBS, FOLDERS, null, '');
    expect(rows.map((r) => r.file.id)).toEqual(['b', 'a', 'c']);
    expect(rows.map((r) => (r.view.kind === 'submittal' ? r.view.company : null))).toEqual(['Sample Co', 'Sample Drywall Co', '']);
  });

  it('narrows to a folder and to a search by name, section, company or stamp', () => {
    expect(sectionRows(FILES, 'submittals', SUBS, FOLDERS, new Set(['t1']), '').map((r) => r.file.id)).toEqual(['a']);
    expect(sectionRows(FILES, 'submittals', SUBS, FOLDERS, null, '092900').map((r) => r.file.id)).toEqual(['a']);
    expect(sectionRows(FILES, 'submittals', SUBS, FOLDERS, null, '07 21').map((r) => r.file.id)).toEqual(['b']);
    expect(sectionRows(FILES, 'submittals', SUBS, FOLDERS, null, 'drywall').map((r) => r.file.id)).toEqual(['a']);
    expect(sectionRows(FILES, 'submittals', SUBS, FOLDERS, null, 'mcn').map((r) => r.file.id)).toEqual(['b']);
    expect(sectionRows(FILES, 'submittals', SUBS, FOLDERS, null, 'cover').map((r) => r.file.id)).toEqual(['c']);
  });

  it('sorts Plans by sheet number', () => {
    const plans = { kind: 'plans', folder_id: 'plans', file_count: 3, folder_ids: ['plans'] };
    const rows = sectionRows(
      [file('x', 'plans', 'Sample Plan Set.pdf'), file('y', 'plans', 'A201 Floor Plan.pdf'), file('z', 'plans', 'A101 Site Plan.pdf')],
      'plans',
      plans,
      [],
      null,
      '',
    );
    expect(rows.map((r) => r.file.id)).toEqual(['z', 'y', 'x']);
  });
});
