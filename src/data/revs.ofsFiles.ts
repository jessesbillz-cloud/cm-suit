// The job's OFS IRs on file, one per OFS number (Jesse, Oct 10: "I know you missed quite a few of the previous
// sign-offs, so I need to be able to go in there and make the changes"): what a manager's sign-off form offers to pick
// by number. The same rule as Link files and rev_file_link (0083, 0094: rev_ofs_name_has, rev_signoff_file_of): a name
// carrying OFS_IR_0041 or _OFS_0041_ (four digits below 10000), a PDF or a picture, finished, live, not infected, one
// the reader may see (RLS), an Attachment or a name starting OFS_IR first, then the newest. Read only when a form opens.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockFiles from './mock/revFiles';

const rowSchema = z.object({
  id: z.string(),
  original_name: z.string(),
  mime: z.string(),
  created_at: z.string(),
  upload_complete: z.boolean(),
  scan_status: z.string(),
});
export type OfsFileRow = z.infer<typeof rowSchema>;

export interface OfsFile {
  ofs: number;
  fileId: string;
  name: string;
}

const SHOWN = /^(application\/pdf|image\/(jpeg|png|webp))$/i;

/** The digits after the mark, read as rev_ofs_name_has writes a number: four digits, or five and more with no leading
 *  zero (10000 and up). */
function readDigits(d: string | undefined): number | null {
  if (d === undefined) return null;
  const n = Number(d);
  if (d.length === 4) return n >= 1 ? n : null;
  return d.length > 4 && !d.startsWith('0') ? n : null;
}

/** The OFS number a file's name carries: OFS_IR_0041 (not followed by a digit) or _OFS_0041_. */
export function ofsNumberOf(name: string): number | null {
  return readDigits(/OFS_IR_(\d+)/i.exec(name)?.[1]) ?? readDigits(/_OFS_(\d+)_/i.exec(name)?.[1]);
}

const preferred = (name: string) => /attachment/i.test(name) || /^OFS_IR/i.test(name);

/** Does `a` win over `b` for its number: an Attachment or an OFS_IR name first, then the newest. */
function beats(a: OfsFileRow, b: OfsFileRow): boolean {
  const p = Number(preferred(a.original_name)) - Number(preferred(b.original_name));
  if (p !== 0) return p > 0;
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.id > b.id;
}

/** One file per OFS number, the rule's pick, highest number first. */
export function ofsFiles(rows: readonly OfsFileRow[]): OfsFile[] {
  const best = new Map<number, OfsFileRow>();
  for (const r of rows) {
    const ofs = ofsNumberOf(r.original_name);
    if (ofs === null || !r.upload_complete || r.scan_status === 'infected' || !SHOWN.test(r.mime)) continue;
    const was = best.get(ofs);
    if (was === undefined || beats(r, was)) best.set(ofs, r);
  }
  return [...best.entries()].sort((a, b) => b[0] - a[0]).map(([ofs, r]) => ({ ofs, fileId: r.id, name: r.original_name }));
}

async function fetchOfsFiles(projectId: string): Promise<OfsFile[]> {
  if (isMock()) return ofsFiles(await mockFiles.ofsFileRows(projectId));
  const rows = throwIfError(
    await supabase
      .from('files')
      .select('id, original_name, mime, created_at, upload_complete, scan_status')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .ilike('original_name', '%OFS%'),
  );
  return ofsFiles(z.array(rowSchema).parse(rows));
}

/** The job's OFS IRs by number, once `on` (a manager's sign-off form is open). Refreshes with the job's revs. */
export function useOfsFiles(projectId: string, on: boolean) {
  return useQuery({ queryKey: qk.revsPart(projectId, 'ofs-files'), queryFn: on ? () => fetchOfsFiles(projectId) : skipToken });
}
