// Where the RFI tool is: the filter (?view=) and the search box (?q=) live in the URL so the log and the reading pane's
// arrow keys agree on what is shown; the open RFI (or "new") is the frame's item, and ?window=1 is the RFI alone in
// its own window (the full view). Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseFilter, type Filter } from './model';

interface LogSearch {
  view?: string | undefined;
  q?: string | undefined;
  window?: '1' | undefined;
}

/** What goes back into the URL: only set values (exactOptionalPropertyTypes). */
interface UrlSearch {
  view?: string;
  q?: string;
  window?: '1';
}

function clean(s: LogSearch): UrlSearch {
  return {
    ...(s.view && s.view !== 'open' ? { view: s.view } : {}),
    ...(s.q ? { q: s.q } : {}),
    ...(s.window === '1' ? { window: '1' as const } : {}),
  };
}

export function useRfisNav(projectId: string, itemId: string | null) {
  const navigate = useNavigate();
  const search: LogSearch = useSearch({ strict: false });

  function go(item: string | null, next: LogSearch, replace = false) {
    const params = { projectId, tool: 'rfis' };
    if (item === null) {
      void navigate({ to: '/p/$projectId/$tool', params, search: clean(next), replace });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId: item }, search: clean(next), replace });
  }

  return {
    filter: parseFilter(search.view),
    query: search.q ?? '',
    /** Alone in its own window: the full view (history shows there). */
    standalone: search.window === '1',
    open: (id: string) => {
      go(id, search);
    },
    /** After a create or a move: the same RFI, replacing "new" in the history. */
    replace: (id: string) => {
      go(id, search, true);
    },
    close: () => {
      go(null, { ...search, window: undefined });
    },
    setFilter: (f: Filter) => {
      go(itemId, { ...search, view: f }, true);
    },
    setQuery: (q: string) => {
      go(itemId, { ...search, q }, true);
    },
  };
}
