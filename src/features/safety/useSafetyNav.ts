// Where the Safety tool is: the view (?view=library) lives in the URL; the open meeting, topic or form is the frame's
// item (the right column, or the phone's full screen). Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseView, type SafetyView } from './model';

interface SafetySearch {
  view?: string | undefined;
}

export function useSafetyNav(projectId: string) {
  const navigate = useNavigate();
  const search: SafetySearch = useSearch({ strict: false });
  const view = parseView(search.view);
  const kept = view === 'library' ? { view } : {};
  const params = { projectId, tool: 'safety' };

  return {
    view,
    setView: (v: SafetyView) => {
      void navigate({ to: '/p/$projectId/$tool', params, search: v === 'library' ? { view: v } : {} });
    },
    /** A meeting, a topic or a form, beside the list; the view stays. `replace` keeps Back where it was (after a create). */
    open: (itemId: string, replace = false) => {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId }, search: kept, replace });
    },
    close: () => {
      void navigate({ to: '/p/$projectId/$tool', params, search: kept });
    },
  };
}
