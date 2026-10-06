// The spec book (migration 0088): the PDFs in the job's Specs folders that I may read, each with its sections (found
// once for everyone from the page text), and the one write, the page text the browser reads from a book whose text
// the server has not read yet (spec_book_pages_save, by whoever may add files to that folder).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mock from './mock/specs';

const specSectionSchema = z.object({
  section: z.string(),
  title: z.string(),
  first_page: z.number().int(),
  last_page: z.number().int(),
});
export type SpecBookSection = z.infer<typeof specSectionSchema>;

const specBookSchema = z.object({
  file_id: z.string(),
  file_name: z.string(),
  size: z.number(),
  page_count: z.number().int().nullable(),
  text_ready: z.boolean(),
  can_send: z.boolean(),
  sections: z.array(specSectionSchema),
});
export type SpecBook = z.infer<typeof specBookSchema>;

async function fetchBooks(projectId: string): Promise<SpecBook[]> {
  if (isMock()) return mock.books(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('spec_books', { p_project_id: projectId }));
  return z.array(specBookSchema).parse(rows);
}

/** The query behind the spec books (a link fetches it when tapped; Files and the viewer keep it fresh). */
export function specBooksQuery(projectId: string) {
  return { queryKey: qk.specBooks(projectId), queryFn: () => fetchBooks(projectId), staleTime: 60_000 };
}

interface PagesInput {
  fileId: string;
  pageCount: number;
  pages: { page: number; text: string }[];
}

async function savePages(v: PagesInput): Promise<number | null> {
  if (isMock()) return mock.savePages(v.fileId);
  const found: unknown = throwIfError(
    await supabase.rpc('spec_book_pages_save', { p_file_id: v.fileId, p_page_count: v.pageCount, p_pages: v.pages }),
  );
  return z.number().int().nullable().parse(found);
}

/** Sends up to 50 pages of a book's text. Answers the sections found once every page is in (then the books reload). */
export function useSaveSpecPages(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savePages,
    onSuccess: (found) => {
      if (found !== null) void qc.invalidateQueries({ queryKey: qk.specBooks(projectId) });
    },
  });
}
