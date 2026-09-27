// Where the corrections tool is: the sort and the search box live in the URL (?sort=, ?q=) so the list and the
// reading pane (arrow keys) agree on the order; the open row is the frame's item. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseSort, sortParam, type Sort } from './model';

interface LogSearch {
  sort?: string | undefined;
  q?: string | undefined;
  window?: '1' | undefined;
}

/** What goes back into the URL: only set values (exactOptionalPropertyTypes). */
interface UrlSearch {
  sort?: string;
  q?: string;
  window?: '1';
}

function clean(s: LogSearch): UrlSearch {
  return {
    ...(s.sort ? { sort: s.sort } : {}),
    ...(s.q ? { q: s.q } : {}),
    ...(s.window === '1' ? { window: '1' as const } : {}),
  };
}

export function useCorrectionsNav(projectId: string, itemId: string | null) {
  const navigate = useNavigate();
  const search: LogSearch = useSearch({ strict: false });

  function go(item: string | null, next: LogSearch, replace = false) {
    const params = { projectId, tool: 'corrections' };
    if (item === null) {
      void navigate({ to: '/p/$projectId/$tool', params, search: clean(next), replace });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId: item }, search: clean(next), replace });
  }

  return {
    sort: parseSort(search.sort),
    query: search.q ?? '',
    open: (id: string) => {
      go(id, search);
    },
    close: () => {
      go(null, { ...search, window: undefined });
    },
    setSort: (next: Sort) => {
      go(itemId, { ...search, sort: sortParam(next) }, true);
    },
    setQuery: (q: string) => {
      go(itemId, { ...search, q }, true);
    },
  };
}
