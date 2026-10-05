// What the mock bidder may read in Files, like folder_can_read and the files policy (0012, 0076): the job's Plans and
// Specs and the folders under them, their own uploads, and a file an issued addendum carries (kept in the job's
// Addenda folder). Nothing else: no Reports, no Photos, no Bids received, no draft addendum's file. Everyone else in
// the mock reads every folder, as before.
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
