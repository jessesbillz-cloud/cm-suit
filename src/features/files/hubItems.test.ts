import { describe, expect, it } from 'vitest';
import type { RfiRef } from '../../data/specHub';
import type { FileRow } from '../../data/types';
import { hubCounts, hubGroups, hubSections, matchSections, namedSections, type HubSources } from './hubItems';

const file = (id: string, name: string, day: number): FileRow => ({
  id,
  project_id: 'p',
  folder_id: 'f',
  original_name: name,
  mime: 'application/pdf',
  size: 1,
  scan_status: 'clean',
  upload_complete: true,
  created_at: `2026-10-${String(day).padStart(2, '0')}T16:00:00Z`,
  created_by: 'u',
});

const rfi = (id: string, refs: string, title: string, day: number): RfiRef => ({
  id,
  number: 1,
  status: 'open',
  title,
  refs,
  pdf_file_id: null,
  created_at: `2026-10-${String(day).padStart(2, '0')}T16:00:00Z`,
});

const SRC: HubSources = {
  submittals: [
    file('s1', '092900_04.0_Sample Board_PD_NET.pdf', 1),
    file('s2', '092900_Sample shop drawings.pdf', 5),
    file('s3', 'S-0147.0-079200-Sample Sealants- PD - AAN.pdf', 2),
    file('s4', 'Sample loose submittal.pdf', 3),
  ],
  rfiFiles: [file('r1', 'RFI 012 - 09 29 00 Sample board.pdf', 4), file('r2', 'RFI 013 Sample.pdf', 4)],
  ccds: [file('c1', 'CCD 03 Sample 092116.pdf', 2)],
  rfis: [rfi('t1', 'Spec 09 29 00, sheet A-501', 'Sample board joint', 6), rfi('t2', 'Sample A-501 detail 4', 'Sample anchors', 7)],
};

describe('spec section hub', () => {
  it('offers the book sections, then the ones only the items name', () => {
    const all = hubSections(
      [{ section: '09 29 00', title: 'Gypsum Board' }, { section: '09 21 16.13', title: 'Sample Level 4' }],
      namedSections(SRC),
      [{ section: '07 92 00', title: 'Joint Sealants' }],
    );
    expect(all.map((s) => [s.section, s.title])).toEqual([
      ['07 92 00', 'Joint Sealants'],
      ['09 21 16', 'Sample Level 4'],
      ['09 29 00', 'Gypsum Board'],
    ]);
    expect(matchSections(all, '0929', () => null).map((s) => s.key)).toEqual(['092900']);
    expect(matchSections(all, 'sealants', () => null).map((s) => s.key)).toEqual(['079200']);
    expect(matchSections(all, '', () => null)).toEqual([]);
  });

  it("lists a section's submittals, RFIs and CCDs, newest first", () => {
    const g = hubGroups('092900', SRC);
    expect(g.submittals.map((f) => f.id)).toEqual(['s2', 's1']);
    expect(g.rfis.map((r) => (r.kind === 'rfi' ? r.rfi.id : r.file.id))).toEqual(['t1', 'r1']);
    expect(g.ccds).toEqual([]);
    expect(hubGroups('092116', SRC).ccds.map((f) => f.id)).toEqual(['c1']);
    expect(hubCounts(SRC).get('092900')).toBe(4);
    expect(hubCounts(SRC).get('079200')).toBe(1);
  });
});
