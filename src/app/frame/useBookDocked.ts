// Files > Specs keeps the spec book in the right column (0118, Jesse, Oct 23: "Use the right side"): while the
// folder in view is in the Specs section, or the spec reader is open (a section, its pages, a volume).
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { fileSectionsQuery } from '../../data/fileSections';
import type { Tool } from '../../lib/layout';

export function useBookDocked(projectId: string | null, tool: Tool, folderId: string | null): boolean {
  const search: { vol?: string | undefined; at?: number | undefined; spec?: string | undefined; pages?: number | undefined } = useSearch({
    strict: false,
  });
  const files = tool === 'files' && projectId !== null;
  const sections = useQuery({ ...fileSectionsQuery(projectId ?? ''), enabled: files });
  if (!files) return false;
  if (search.vol !== undefined || search.at !== undefined || search.spec !== undefined || search.pages !== undefined) return true;
  const specs = sections.data?.find((s) => s.kind === 'specs');
  return folderId !== null && specs !== undefined && specs.folder_ids.includes(folderId);
}
