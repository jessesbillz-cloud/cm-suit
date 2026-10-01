// Where the permit tool is: the filter (?view=) lives in the URL; the open permit (or "new") is the frame's item, on a
// job (/p/<job>/permits/<id>) or on All my jobs, the official's caseload (/all/permits/<id>); ?window=1 is the permit
// alone in its own window. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseFilter, type Filter } from './model';

interface LogSearch {
  view?: string | undefined;
  window?: '1' | undefined;
}

/** What goes back into the URL: only set values (exactOptionalPropertyTypes). */
interface UrlSearch {
  view?: string;
  window?: '1';
}

function clean(s: LogSearch): UrlSearch {
  return {
    ...(s.view && s.view !== 'open' ? { view: s.view } : {}),
    ...(s.window === '1' ? { window: '1' as const } : {}),
  };
}

export function usePermitsNav(projectId: string | null, itemId: string | null) {
  const navigate = useNavigate();
  const search: LogSearch = useSearch({ strict: false });

  function go(item: string | null, next: LogSearch, replace = false) {
    const s = clean(next);
    if (projectId === null) {
      if (item === null) void navigate({ to: '/all/permits', search: s, replace });
      else void navigate({ to: '/all/permits/$itemId', params: { itemId: item }, search: s, replace });
      return;
    }
    const params = { projectId, tool: 'permits' };
    if (item === null) void navigate({ to: '/p/$projectId/$tool', params, search: s, replace });
    else void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId: item }, search: s, replace });
  }

  return {
    filter: parseFilter(search.view),
    /** Alone in its own window: the full view (history shows there). */
    standalone: search.window === '1',
    open: (id: string) => {
      go(id, search);
    },
    /** After a create: the new permit, replacing "new" in the history. */
    replace: (id: string) => {
      go(id, search, true);
    },
    close: () => {
      go(null, { ...search, window: undefined });
    },
    setFilter: (f: Filter) => {
      go(itemId, { ...search, view: f }, true);
    },
  };
}
