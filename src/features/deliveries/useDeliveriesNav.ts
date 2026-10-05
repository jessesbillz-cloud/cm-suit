// Where the deliveries tool is: the view (?view=) and the picked day (?day=) live in the URL, the open delivery (or
// the post form, item 'new') is the frame's item. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';

const DELIVERY_VIEWS = ['board', 'month', 'link', 'tv'] as const;
export type DeliveryView = (typeof DELIVERY_VIEWS)[number];

function parseDeliveryView(v: string | undefined): DeliveryView {
  return DELIVERY_VIEWS.find((x) => x === v) ?? 'board';
}

/** A yyyy-mm-dd day from the URL, or null. */
export function parseDay(v: string | undefined): string | null {
  return v !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** The item id of the post form in the right column. */
export { NEW_ITEM } from '../../lib/itemIds';

export function useDeliveriesNav(projectId: string) {
  const navigate = useNavigate();
  const search: { view?: string | undefined; day?: string | undefined; window?: string | undefined } = useSearch({ strict: false });
  const view = parseDeliveryView(search.view);
  const day = parseDay(search.day);
  /** The item is alone in its own window (?window=1): there is no board behind it. */
  const standalone = search.window === '1';
  const keep = (next: Partial<{ view: DeliveryView; day: string | null }>) => {
    const v = next.view ?? view;
    const d = next.day === undefined ? day : next.day;
    return { ...(v === 'board' ? {} : { view: v }), ...(d === null ? {} : { day: d }) };
  };

  function setView(next: DeliveryView) {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'deliveries' }, search: keep({ view: next }) });
  }

  function pickDay(next: string) {
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'deliveries' }, search: keep({ day: next }) });
  }

  /** Opens a delivery (or the post form, NEW_ITEM) in the right column; with `onDay`, the board shows that day too. */
  function open(itemId: string, onDay?: string) {
    void navigate({
      to: '/p/$projectId/$tool/$itemId',
      params: { projectId, tool: 'deliveries', itemId },
      search: keep(onDay === undefined ? {} : { day: onDay }),
    });
  }

  /** The board behind an open delivery moves to its day (replacing the address, so Back skips the move). */
  function showDayOf(itemId: string, onDay: string) {
    void navigate({
      to: '/p/$projectId/$tool/$itemId',
      params: { projectId, tool: 'deliveries', itemId },
      search: keep({ day: onDay }),
      replace: true,
    });
  }

  return { view, day, standalone, setView, pickDay, open, showDayOf };
}
