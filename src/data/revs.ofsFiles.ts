// The job's OFS IRs on file, one per OFS number (Jesse, Oct 10: "I know you missed quite a few of the previous
// sign-offs, so I need to be able to go in there and make the changes"): what a manager's sign-off form offers to pick
// by number. The same rule as Link files and rev_file_link (0083, 0094: rev_ofs_name_has, rev_signoff_file_of): a name
// carrying OFS_IR_0041 or _OFS_0041_ (four digits below 10000), a PDF or a picture, finished, live, not infected, one
// the reader may see (RLS), an Attachment or a name starting OFS_IR first, then the newest (revs.types ofsFiles). Read
// only when a form opens.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockFiles from './mock/revFiles';
import { ofsFileRowSchema, ofsFiles, type OfsFile } from './revs.types';

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
  return ofsFiles(z.array(ofsFileRowSchema).parse(rows));
}

/** The job's OFS IRs by number, once `on` (a manager's sign-off form is open). Refreshes with the job's revs. */
export function useOfsFiles(projectId: string, on: boolean) {
  return useQuery({ queryKey: qk.revsPart(projectId, 'ofs-files'), queryFn: on ? () => fetchOfsFiles(projectId) : skipToken });
}
