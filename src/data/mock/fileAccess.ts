// What the mock bidder may read in Files, like folder_can_read and the files policy (0012, 0076): the job's Plans and
// Specs and the folders under them, their own uploads, and a file an issued addendum carries (kept in the job's
// Addenda folder). Nothing else: no Reports, no Photos, no Bids received, no draft addendum's file. Everyone else in
// the mock reads every folder, as before, but Files' sections follow folder_row_can_read (sectionFolderReadable).
import type { FileRow, FolderRow } from '../types';
import { issuedFileIds } from './addenda';
import { mockUser } from './index';

const BID_DOC_KINDS = ['plans', 'specs'];

function isMockBidder(): boolean {
  return mockUser().id === 'mock-user-bidder';
}

/** The folder is Plans or Specs, or under one of them. */
function inBidDocs(folder: FolderRow, all: readonly FolderRow[]): boolean {
  let at: FolderRow | undefined = folder;
  for (let depth = 0; at && depth < 32; depth += 1) {
    if (BID_DOC_KINDS.includes(at.kind)) return true;
    const parent: string | null = at.parent_id;
    at = parent === null ? undefined : all.find((f) => f.id === parent);
  }
  return false;
}

export function folderReadable(folder: FolderRow, all: readonly FolderRow[]): boolean {
  return !isMockBidder() || inBidDocs(folder, all);
}

export function fileReadable(file: FileRow, all: readonly FolderRow[]): boolean {
  if (!isMockBidder() || file.created_by === mockUser().id) return true;
  const folder = all.find((f) => f.id === file.folder_id);
  if (folder && inBidDocs(folder, all)) return true;
  return file.folder_id.endsWith('-addenda') && issuedFileIds().includes(file.id);
}

// Files' sections (0090, 0099): files.read_project reads the job's documents (Plans, Specs, Submittals, CCDs ... and the
// folders under them) and RFIs' Uploaded folder. files.read_records reads every folder but the RFI tool's own, which
// rfi.sign_issue browses. role_permissions' files rows for the mock personas: the outside ones read documents only.
const DOC_KINDS = ['plans', 'specs', 'addenda', 'dsa_103', 'ccd', 'approved_plans', 'submittals'];
const DOCS_ONLY: Record<string, true> = { sub: true, foreman: true, special_inspector: true, ahj: true };

/** The folder's nearest kind other than general (its own first). */
function nearestKind(folder: FolderRow, all: readonly FolderRow[]): string {
  let at: FolderRow | undefined = folder;
  for (let depth = 0; at && depth < 32; depth += 1) {
    if (at.kind !== 'general') return at.kind;
    const parent: string | null = at.parent_id;
    at = parent === null ? undefined : all.find((f) => f.id === parent);
  }
  return 'general';
}

/** RFIs' Uploaded folder (files_rfi_uploads_make), with its own access list. */
function isRfiUploads(folder: FolderRow, all: readonly FolderRow[]): boolean {
  const parent = all.find((f) => f.id === folder.parent_id);
  return folder.kind === 'general' && folder.name === 'Uploaded' && parent?.kind === 'rfis' && parent.parent_id === null;
}

/** May the mock user read this folder in Files' sections (folder_row_can_read)? */
export function sectionFolderReadable(folder: FolderRow, all: readonly FolderRow[], signsRfis: boolean): boolean {
  if (!folderReadable(folder, all)) return false;
  let at: FolderRow | undefined = folder;
  for (let depth = 0; at && depth < 32; depth += 1) {
    if (isRfiUploads(at, all)) return true;
    if (at.kind === 'rfis') return signsRfis;
    const parent: string | null = at.parent_id;
    at = parent === null ? undefined : all.find((f) => f.id === parent);
  }
  const who = mockUser().id.replace(/^mock-user-/, '');
  return DOCS_ONLY[who] !== true || DOC_KINDS.includes(nearestKind(folder, all));
}
