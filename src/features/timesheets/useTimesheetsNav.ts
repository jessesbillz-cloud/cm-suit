// Where the Timesheets tool is: the month (?day=yyyy-MM-01; this month by default), the company when my hours jobs
// belong to more than one (?org=), and the open item (an invoice, or billing) in the right column. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { monthFrom } from './model';

interface TimesheetsSearch {
  day?: string | undefined;
  org?: string | undefined;
}

/** What goes back into the URL: only set values (exactOptionalPropertyTypes). */
function clean(s: TimesheetsSearch): { day?: string; org?: string } {
  return { ...(s.day ? { day: s.day } : {}), ...(s.org ? { org: s.org } : {}) };
}

export function useTimesheetsNav() {
  const navigate = useNavigate();
  const search: TimesheetsSearch = useSearch({ strict: false });
  const month = monthFrom(search.day);

  function go(itemId: string | null, next: TimesheetsSearch) {
    if (itemId === null) {
      void navigate({ to: '/all/timesheets', search: clean(next) });
      return;
    }
    void navigate({ to: '/all/timesheets/$itemId', params: { itemId }, search: clean(next) });
  }

  return {
    month,
    org: search.org ?? null,
    setMonth: (next: string, itemId: string | null) => {
      go(itemId, { ...search, day: `${next}-01` });
    },
    setOrg: (org: string, itemId: string | null) => {
      go(itemId, { ...search, org });
    },
    open: (itemId: string) => {
      go(itemId, search);
    },
    close: () => {
      go(null, search);
    },
  };
}
