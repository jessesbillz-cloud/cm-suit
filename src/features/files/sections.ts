// Files' sections (0097): which ones the left card lists, which section and filter the URL's folder means, the filter's
// folders (a submittal trade folder by its company), and where Move to may send a file.
import type { FileSection } from '../../data/fileSections';
import type { FolderRow } from '../../data/types';
import { SECTION_KINDS, type SectionKind } from './classify';
import { companyOf } from './fileNames';
import { folderLabel } from './folderOrder';

export const SECTION_LABEL: Record<SectionKind, string> = {
  plans: 'Plans',
  specs: 'Specs',
  submittals: 'Submittals',
  rfis: 'RFIs',
  ccd: 'CCDs',
  reports: 'Reports',
  photos: 'Photos',
  unsorted: 'To sort',
  bids_received: 'Bids received',
  inbound: 'Emailed in',
};

export function sectionKind(s: Pick<FileSection, 'kind'>): SectionKind | null {
  return SECTION_KINDS.find((k) => k === s.kind) ?? null;
}

/** Shown only while something is in them. */
const WHILE_FULL: readonly SectionKind[] = ['unsorted', 'bids_received', 'inbound'];

/** The sections the left card lists, in their order. */
export function shownSections(all: readonly FileSection[]): FileSection[] {
  return all.filter((s) => {
    const k = sectionKind(s);
    return k !== null && (!WHILE_FULL.includes(k) || s.file_count > 0);
  });
}

interface SectionView {
  section: FileSection;
  /** A folder under the section the list is narrowed to; null for all of it. */
  filterId: string | null;
}

/** The URL's folder: its section, narrowed to it when it is a folder under the section. Else the first section. */
export function resolveView(all: readonly FileSection[], folderId: string | null): SectionView | null {
  const holding = folderId === null ? undefined : all.find((s) => sectionKind(s) !== null && s.folder_ids.includes(folderId));
  if (holding && folderId !== null) return { section: holding, filterId: folderId === holding.folder_id ? null : folderId };
  const first = shownSections(all)[0];
  return first ? { section: first, filterId: null } : null;
}

type Folder = Pick<FolderRow, 'id' | 'parent_id' | 'name' | 'person' | 'app_only'>;

/** The folder's names from just under the section's folder down to it. */
function pathBelow(id: string, rootId: string, byId: ReadonlyMap<string, Folder>): string[] {
  const names: string[] = [];
  let at = byId.get(id);
  for (let depth = 0; at && at.id !== rootId && depth < 32; depth += 1) {
    names.unshift(folderLabel(at));
    at = at.parent_id === null ? undefined : byId.get(at.parent_id);
  }
  return names;
}

export interface FolderOption {
  id: string;
  label: string;
}

/** A folder under the section by its path below it; in Submittals the trade folder by its company. */
function labelIn(section: FileSection, id: string, byId: ReadonlyMap<string, Folder>): string {
  const path = pathBelow(id, section.folder_id, byId);
  const [first, ...rest] = path;
  if (section.kind === 'submittals' && first !== undefined) return [companyOf(first), ...rest].join(' / ');
  return path.join(' / ');
}

/** The section's filter: every folder under its own, by label (a label two folders share shows their paths). */
export function filterOptions(section: FileSection, folders: readonly Folder[]): FolderOption[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const ids = section.folder_ids.filter((id) => id !== section.folder_id && byId.has(id));
  const labels = ids.map((id) => labelIn(section, id, byId));
  return ids
    .map((id, i) => {
      const label = labels[i] ?? '';
      const shared = labels.filter((l) => l === label).length > 1;
      return { id, label: shared ? pathBelow(id, section.folder_id, byId).join(' / ') : label };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
}

/** The company of a file's trade folder in Submittals ("" for a file right in Submittals). */
export function companyIn(section: FileSection, folderId: string, folders: readonly Folder[]): string {
  const [first] = pathBelow(folderId, section.folder_id, new Map(folders.map((f) => [f.id, f])));
  return first === undefined ? '' : companyOf(first);
}

/** Where Move to may send files: each section's folders I may add to that the app doesn't fill, in section order. */
export function moveTargets(all: readonly FileSection[], folders: readonly Folder[], writable: ReadonlySet<string>): FolderOption[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  return all.flatMap((s) => {
    const kind = sectionKind(s);
    if (kind === null) return [];
    return s.folder_ids.flatMap((id) => {
      const f = byId.get(id);
      if (!f || f.app_only || !writable.has(id)) return [];
      const below = pathBelow(id, s.folder_id, byId);
      return [{ id, label: [SECTION_LABEL[kind], ...below].join(' / ') }];
    });
  });
}
