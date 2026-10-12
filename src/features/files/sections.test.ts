import { describe, expect, it } from 'vitest';
import type { FileSection } from '../../data/fileSections';
import { companyIn, filterOptions, moveTargets, resolveView, shownSections } from './sections';

const folder = (id: string, parent: string | null, name: string, appOnly = false) => ({
  id,
  parent_id: parent,
  name,
  person: null,
  app_only: appOnly,
});

const FOLDERS = [
  folder('plans', null, 'Plans'),
  folder('arch', 'plans', 'Architectural'),
  folder('subs', null, 'Submittals'),
  folder('t1', 'subs', '092000 - Framing - Sample Drywall Co'),
  folder('t2', 'subs', '081000 - Doors - Sample Door Co'),
  folder('t3', 'subs', '099100 - Painting - Sample Door Co'),
  folder('t1a', 't1', 'Resubmittals'),
  folder('reports', null, 'Reports', true),
  folder('sort', null, 'To sort'),
  folder('loose', null, 'Sample loose'),
];

const section = (kind: string, root: string, ids: string[], count = 1): FileSection => ({
  kind,
  folder_id: root,
  file_count: count,
  folder_ids: ids,
});

const ALL = [
  section('plans', 'plans', ['plans', 'arch'], 6),
  section('submittals', 'subs', ['subs', 't1', 't2', 't3', 't1a'], 434),
  section('reports', 'reports', ['reports'], 0),
  section('unsorted', 'sort', ['sort', 'loose'], 2),
  section('bids_received', 'bids', ['bids'], 0),
];

describe("Files' sections", () => {
  it('lists To sort, Bids received and Emailed in only while something is in them', () => {
    expect(shownSections(ALL).map((s) => s.kind)).toEqual(['plans', 'submittals', 'reports', 'unsorted']);
    expect(shownSections([section('unsorted', 'sort', ['sort'], 0)])).toEqual([]);
  });

  it("reads the URL's folder as a section, narrowed when it is a folder under it", () => {
    expect(resolveView(ALL, 't1')).toEqual({ section: ALL[1], filterId: 't1' });
    expect(resolveView(ALL, 'subs')).toEqual({ section: ALL[1], filterId: null });
    expect(resolveView(ALL, 'loose')).toEqual({ section: ALL[3], filterId: 'loose' });
    expect(resolveView(ALL, null)).toEqual({ section: ALL[0], filterId: null });
    expect(resolveView(ALL, 'not-here')).toEqual({ section: ALL[0], filterId: null });
  });

  it('offers trade folders by company, a shared company by its folder', () => {
    expect(filterOptions(ALL[1] as FileSection, FOLDERS)).toEqual([
      { id: 't2', label: '081000 - Doors - Sample Door Co' },
      { id: 't3', label: '099100 - Painting - Sample Door Co' },
      { id: 't1', label: 'Sample Drywall Co' },
      { id: 't1a', label: 'Sample Drywall Co / Resubmittals' },
    ]);
    expect(filterOptions(ALL[0] as FileSection, FOLDERS)).toEqual([{ id: 'arch', label: 'Architectural' }]);
    expect(filterOptions(ALL[3] as FileSection, FOLDERS)).toEqual([{ id: 'loose', label: 'Sample loose' }]);
  });

  it("finds a file's company from its trade folder", () => {
    expect(companyIn(ALL[1] as FileSection, 't1a', FOLDERS)).toBe('Sample Drywall Co');
    expect(companyIn(ALL[1] as FileSection, 'subs', FOLDERS)).toBe('');
  });

  it('moves only to folders I may add to that the app does not fill, by section', () => {
    const writable = new Set(['plans', 'arch', 'subs', 't1', 'reports', 'sort', 'loose']);
    expect(moveTargets(ALL, FOLDERS, writable).map((t) => t.label)).toEqual([
      'Plans',
      'Plans / Architectural',
      'Submittals',
      'Submittals / 092000 - Framing - Sample Drywall Co',
      'To sort',
      'To sort / Sample loose',
    ]);
  });
});
