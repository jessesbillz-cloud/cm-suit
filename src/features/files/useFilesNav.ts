// Where Files is besides its folder: the spec section search (?q=) and a spec section's page (?spec=092900, Jesse,
// Oct 12). Both live in the URL, so Back returns from a section's page to the boxes, and from a file to the page.
// Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';

interface FilesSearch {
  folder?: string | undefined;
  q?: string | undefined;
  spec?: string | undefined;
}

/** Only set values (exactOptionalPropertyTypes). */
function clean(s: FilesSearch): { folder?: string; q?: string; spec?: string } {
  return {
    ...(s.folder ? { folder: s.folder } : {}),
    ...(s.q ? { q: s.q } : {}),
    ...(s.spec ? { spec: s.spec } : {}),
  };
}

export function useFilesNav(projectId: string) {
  const navigate = useNavigate();
  const search: FilesSearch = useSearch({ strict: false });
  const params = { projectId, tool: 'files' };
  return {
    query: search.q ?? '',
    spec: search.spec ?? null,
    /** The search box: its boxes replace the list while it has text. */
    setQuery: (q: string) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: clean({ folder: search.folder, q: q.trim() === '' ? undefined : q }), replace: true });
    },
    openSection: (key: string) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: clean({ ...search, spec: key }) });
    },
    /** A file from the section's page: its pane beside the page. */
    openFile: (fileId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId: fileId }, search: clean(search) });
    },
    openRfi: (rfiId: string) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'rfis', itemId: rfiId } });
    },
  };
}
