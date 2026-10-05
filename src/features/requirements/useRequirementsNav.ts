// Where the Requirements tool is: the view (?view=all|drafts) and All's grouping (?by=section|company) live in the URL;
// the open line, the add form or the spec reader is the frame's item (the right column, or the phone's full screen).
// Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseGrouping, parseView, type Grouping, type RequirementsView } from './model';

interface RequirementsSearch {
  view?: string | undefined;
  by?: string | undefined;
}

function searchOf(view: RequirementsView, by: Grouping): { view?: RequirementsView; by?: 'section' | 'company' } {
  return { ...(view === 'due' ? {} : { view }), ...(view === 'all' && by !== 'kind' ? { by } : {}) };
}

export function useRequirementsNav(projectId: string) {
  const navigate = useNavigate();
  const search: RequirementsSearch = useSearch({ strict: false });
  const view = parseView(search.view);
  const by = parseGrouping(search.by);
  const kept = searchOf(view, by);
  const params = { projectId, tool: 'requirements' };

  return {
    view,
    by,
    setView: (v: RequirementsView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: searchOf(v, by) });
    },
    setGrouping: (g: Grouping) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: searchOf(view, g), replace: true });
    },
    /** A line or a form beside the list; the view stays. `replace` keeps Back where it was (after an add). */
    open: (itemId: string, replace = false) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: kept, replace });
    },
    /** Another view with something open beside it (after a read: the Drafts). */
    openIn: (v: RequirementsView, itemId: string | null) => {
      const s = searchOf(v, by);
      if (itemId === null) void navigate({ to: '/p/$projectId/$tool', params, search: s });
      else void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: s });
    },
    close: () => {
      void navigate({ to: '/p/$projectId/$tool', params, search: kept });
    },
  };
}
