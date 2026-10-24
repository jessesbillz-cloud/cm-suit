// The spec book (migrations 0088, 0118): the PDFs in the job's Specs folders that I may read, each with its sections
// (found once for everyone from the page text the server reads), and one section's text as structure (the server parses
// it, supabase/functions/_shared/specText.ts). Nothing here reads a PDF's text in the browser.
import { useQuery } from '@tanstack/react-query';
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
  sections: z.array(specSectionSchema),
});
export type SpecBook = z.infer<typeof specBookSchema>;

async function fetchBooks(projectId: string): Promise<SpecBook[]> {
  if (isMock()) return mock.books(projectId);
  const rows: unknown = throwIfError(await supabase.rpc('spec_books', { p_project_id: projectId }));
  return z.array(specBookSchema).parse(rows);
}

/** The query behind the spec books (a link fetches it when tapped; Files keeps it fresh). */
export function specBooksQuery(projectId: string) {
  return { queryKey: qk.specBooks(projectId), queryFn: () => fetchBooks(projectId), staleTime: 60_000 };
}

export function useSpecBooks(projectId: string) {
  return useQuery(specBooksQuery(projectId));
}

const blockSchema = z.discriminatedUnion('k', [
  z.object({ k: z.literal('part'), n: z.string(), t: z.string() }),
  z.object({ k: z.literal('article'), n: z.string(), t: z.string() }),
  z.object({ k: z.literal('para'), n: z.string(), d: z.number().int().min(1).max(5), t: z.string() }),
  z.object({ k: z.literal('text'), t: z.string() }),
]);
export type SpecTextBlock = z.infer<typeof blockSchema>;

const sectionTextSchema = z.object({
  /** done: the blocks. no_text: a scan (show its pages). waiting: the server has not read it yet. */
  status: z.enum(['done', 'no_text', 'waiting']),
  body: z.array(blockSchema),
});
export type SpecSectionText = z.infer<typeof sectionTextSchema>;

async function fetchSectionText(fileId: string, firstPage: number): Promise<SpecSectionText | null> {
  if (isMock()) return mock.sectionText(fileId, firstPage);
  const rows: unknown = throwIfError(await supabase.rpc('spec_section_read', { p_file_id: fileId, p_first_page: firstPage }));
  return z.array(sectionTextSchema).parse(rows)[0] ?? null;
}

/** A section's text; null when no such section is mine to read. Asks again every 20 s while the server reads it. */
export function useSectionText(fileId: string, firstPage: number) {
  return useQuery({
    queryKey: qk.specSectionText(fileId, firstPage),
    queryFn: () => fetchSectionText(fileId, firstPage),
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (q.state.data?.status === 'waiting' ? 20_000 : false),
  });
}
