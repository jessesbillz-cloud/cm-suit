// A file's spec section (0105, Jesse, Oct 12: "determine the section and then put it somewhere in the title, hidden if
// we had to"): the hidden field the spec section page reads before the name. Two writes, both decided by the database
// (someone who may see the file and add to it): Fill, for files that have none (right after an upload, and Files
// filling a list's files from their names), never overwriting, and Set, with a version check (Add spec section, through
// files.ts useAddSpecSection).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/files';

interface SectionFill {
  fileId: string;
  /** "092900". */
  section: string;
}

/** What the database takes in one call. */
const FILL_MAX = 500;

/** Gives each file with no section yet its section; the rest are skipped. Answers how many it set. */
export async function fillFileSections(items: readonly SectionFill[]): Promise<number> {
  let set = 0;
  for (let at = 0; at < items.length; at += FILL_MAX) {
    const chunk = items.slice(at, at + FILL_MAX);
    set += isMock()
      ? await mock.fillSections(chunk)
      : throwIfError(
          await supabase.rpc('file_spec_sections_fill', { p_items: chunk.map((c) => ({ file_id: c.fileId, section: c.section })) }),
        );
  }
  return set;
}

/** Fill for a job's list: the job's Files lists ask again when any was set. */
export function useFillFileSections(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fillFileSections,
    onSuccess: async (set) => {
      if (set > 0) await qc.invalidateQueries({ queryKey: qk.folders(projectId) });
    },
  });
}

/** Set (or clear) one file's section, with its version check. Answers its new version. */
export async function setFileSection(id: string, version: number, section: string | null): Promise<number> {
  if (isMock()) return mock.setSection(id, version, section);
  return throwIfError(await supabase.rpc('file_spec_section_set', { p_file_id: id, p_version: version, p_section: section ?? '' }));
}
