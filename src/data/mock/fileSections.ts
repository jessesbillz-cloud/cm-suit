// e2e mock of files_sections (0097): the job's sections in their order, each section's folder found, adopted (a
// top-level folder of people's own named like it) or made, with the folders in it and its file count. To sort holds
// every other top-level folder but the ones a tool owns. Nothing real in it.
import type { FileSection } from '../fileSections';
import type { FileRow, FolderRow } from '../types';
import * as api from './api';
import { writeMock } from './store';

const KINDS = ['plans', 'specs', 'submittals', 'rfis', 'ccd', 'reports', 'photos', 'unsorted', 'bids_received', 'inbound'];

/** The sections made when missing: kind, name, the names of people's own folders it adopts. */
const MADE: readonly [string, string, readonly string[]][] = [
  ['plans', 'Plans', ['plans']],
  ['specs', 'Specs', ['specs', 'specifications']],
  ['submittals', 'Submittals', ['submittals', 'submittal']],
  ['rfis', 'RFIs', []],
  ['ccd', 'CCDs', ['ccds', 'ccd']],
  ['reports', 'Reports', ['reports']],
  ['photos', 'Photos', ['photos']],
  ['unsorted', 'To sort', ['to sort']],
];

const TOOL_KINDS = new Set(['approved_plans', 'stamping', 'permit_uploads', 'bid_forms', 'safety', 'schedule', 'requirements', 'addenda',
  'transmittals', 'system']);

async function makeMissing(projectId: string): Promise<void> {
  for (const [kind, name, aliases] of MADE) {
    const list = await api.folders(projectId);
    const top = list.filter((f) => f.parent_id === null);
    if (top.some((f) => f.kind === kind)) continue;
    const own = top.find((f) => f.kind === 'general' && !f.app_only && aliases.includes(f.name.trim().toLowerCase()));
    if (own) {
      const adopted: FolderRow = { ...own, kind, name: top.some((f) => f.name === name) ? own.name : name };
      writeMock((m) => ({ ...m, folders: [...m.folders.filter((f) => f.id !== own.id), adopted] }));
    } else {
      await api.appFolder(projectId, null, name, kind);
    }
  }
}

function subtree(rootId: string, list: readonly FolderRow[]): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length && i < 2000; i += 1) {
    for (const f of list) if (f.parent_id === out[i]) out.push(f.id);
  }
  return out;
}

export async function sections(projectId: string): Promise<FileSection[]> {
  await makeMissing(projectId);
  const list = await api.folders(projectId);
  const top = list.filter((f) => f.parent_id === null);
  const rootOf = (kind: string) => top.find((f) => f.kind === kind);
  const roots = KINDS.flatMap((k) => rootOf(k)?.id ?? []);
  const loose = top.filter((f) => !roots.includes(f.id) && !f.app_only && !TOOL_KINDS.has(f.kind));
  const files = await sectionFiles(list.map((f) => f.id));
  return KINDS.flatMap((kind) => {
    const root = rootOf(kind);
    if (!root) return [];
    const ids = [...subtree(root.id, list), ...(kind === 'unsorted' ? loose.flatMap((f) => subtree(f.id, list)) : [])];
    const count = files.filter((x) => ids.includes(x.folder_id) && x.upload_complete).length;
    return [{ kind, folder_id: root.id, file_count: count, folder_ids: ids }];
  });
}

export async function sectionFiles(folderIds: readonly string[]): Promise<FileRow[]> {
  const lists = await Promise.all(folderIds.map((id) => api.files(id)));
  return lists.flat().sort((a, b) => a.original_name.localeCompare(b.original_name));
}
