// Mock default folders: a synthetic copy of the folder_templates seed (migration 0027), so a mock job opens with the
// folders a real one of that company kind would, and turning DSA on adds the DSA folders once.
import type { FolderRow } from '../types';
import { MOCK_PROJECTS } from './fixtures';
import { readMock } from './store';

type Applies = 'both' | 'dsa' | 'non_dsa';

interface Template {
  /** Mock folder ids are `<job>-<suffix>` (the bid intake mocks use `<job>-bids` and `<job>-plans`). */
  suffix: string;
  kind: string;
  name: string;
  sort: number;
  aiReads: boolean;
  applies: Applies;
}

const PLANS_SPECS: Template[] = [
  { suffix: 'plans', kind: 'plans', name: 'Plans', sort: 10, aiReads: true, applies: 'both' },
  { suffix: 'specs', kind: 'specs', name: 'Specs', sort: 20, aiReads: true, applies: 'both' },
];

const REPORTS_PHOTOS: Template[] = [
  { suffix: 'reports', kind: 'reports', name: 'Reports', sort: 50, aiReads: true, applies: 'both' },
  { suffix: 'photos', kind: 'photos', name: 'Photos', sort: 60, aiReads: false, applies: 'both' },
];

const TEMPLATES: Record<string, Template[]> = {
  inspector: [
    ...PLANS_SPECS,
    { suffix: 'dsa-103', kind: 'dsa_103', name: 'DSA 103', sort: 30, aiReads: true, applies: 'dsa' },
    { suffix: 'ccd', kind: 'ccd', name: 'CCDs', sort: 40, aiReads: true, applies: 'dsa' },
    { suffix: 'ti', kind: 'ti', name: 'Testing & inspections', sort: 30, aiReads: true, applies: 'non_dsa' },
    ...REPORTS_PHOTOS,
  ],
  gc: [...PLANS_SPECS, { suffix: 'bids', kind: 'bids_received', name: 'Bids received', sort: 30, aiReads: false, applies: 'both' }, ...REPORTS_PHOTOS],
};

function fromTemplates(projectId: string, orgKind: string, applies: readonly Applies[]): FolderRow[] {
  return (TEMPLATES[orgKind] ?? [...PLANS_SPECS, ...REPORTS_PHOTOS])
    .filter((t) => applies.includes(t.applies))
    .map((t) => ({
      id: `${projectId}-${t.suffix}`,
      project_id: projectId,
      parent_id: null,
      name: t.name,
      kind: t.kind,
      view_only: false,
      proprietary: false,
      sort: t.sort,
      ai_reads: t.aiReads,
      version: 1,
      file_count: null,
    }));
}

/** The fixture jobs belong to a GC; each also has an old "Emailed in" folder with nothing in it (the tree hides it). */
export const MOCK_FOLDERS: FolderRow[] = MOCK_PROJECTS.flatMap((p) => [
  ...fromTemplates(p.project_id, 'gc', ['both', 'non_dsa']),
  {
    id: `${p.project_id}-inbound`,
    project_id: p.project_id,
    parent_id: null,
    name: 'Emailed in',
    kind: 'inbound',
    view_only: false,
    proprietary: false,
    sort: 900,
    ai_reads: false,
    version: 1,
    file_count: 0,
  },
]);

/** A new mock job's folders. */
export function newJobFolders(projectId: string, orgKind: string, isDsa: boolean): FolderRow[] {
  return fromTemplates(projectId, orgKind, isDsa ? ['both', 'dsa'] : ['both', 'non_dsa']);
}

/** DSA turned on: the DSA folders the job doesn't have yet (by kind). */
export function missingDsaFolders(projectId: string, orgKind: string): FolderRow[] {
  const have = new Set([...MOCK_FOLDERS, ...readMock().folders].filter((f) => f.project_id === projectId).map((f) => f.kind));
  return fromTemplates(projectId, orgKind, ['dsa']).filter((f) => !have.has(f.kind));
}
