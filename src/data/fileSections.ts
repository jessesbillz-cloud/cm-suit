// Files as fixed sections (0097, Jesse, Oct 11): the job's sections (files_sections finds or makes their folders and
// answers each one the caller reads, with the folders in it and its file count), and one section's files, every file
// in its folders as one flat list.
import { skipToken, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useUser } from './auth';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/fileSections';
import { FILE_COLS } from './queries';
import type { FileRow } from './types';

const sectionSchema = z.object({
  kind: z.string(),
  folder_id: z.string(),
  file_count: z.number(),
  folder_ids: z.array(z.string()),
});
export type FileSection = z.infer<typeof sectionSchema>;

async function fetchSections(projectId: string): Promise<FileSection[]> {
  if (isMock()) return mock.sections(projectId);
  return z.array(sectionSchema).parse(throwIfError(await supabase.rpc('files_sections', { p_project_id: projectId })));
}

/** The sections I read on this job, in their order. */
export function useFileSections(projectId: string) {
  return useQuery({ queryKey: qk.fileSections(projectId), queryFn: () => fetchSections(projectId) });
}

async function fetchSectionFiles(folderIds: readonly string[], userId: string): Promise<FileRow[]> {
  const rows: FileRow[] = isMock()
    ? await mock.sectionFiles(folderIds)
    : folderIds.length === 0
      ? []
      : throwIfError(
          await supabase
            .from('files')
            .select(FILE_COLS)
            .in('folder_id', [...folderIds])
            .is('deleted_at', null)
            .is('superseded_by', null)
            .order('original_name'),
        );
  // Someone else's unfinished upload is not a file yet; my own shows so I can see it resume.
  return rows.filter((f) => f.upload_complete || f.created_by === userId);
}

/** Every file in a section's folders (null while the sections load). */
export function useSectionFiles(projectId: string, section: FileSection | null) {
  const user = useUser();
  return useQuery({
    queryKey: qk.sectionFiles(projectId, section?.kind ?? '', section?.folder_ids ?? []),
    queryFn: section ? () => fetchSectionFiles(section.folder_ids, user.id) : skipToken,
  });
}
