// Where the public delivery link page is: /d/<project>?t=<token>&view=post|tv&day=<yyyy-mm-dd>&r=<receipt id>.
// The token rides along on every move. Router only.
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { parseDay } from './useDeliveriesNav';

const route = getRouteApi('/d/$projectId');

type PublicView = 'board' | 'post' | 'tv';

export function usePublicNav() {
  const { projectId } = route.useParams();
  const search = route.useSearch();
  const navigate = useNavigate();
  const token = search.t ?? null;
  const view: PublicView = search.view === 'post' || search.view === 'tv' ? search.view : 'board';
  const day = parseDay(search.day);
  const receiptId = search.r ?? null;

  function go(next: { view?: PublicView; day?: string | null; r?: string | null }) {
    const v = next.view ?? view;
    const d = next.day === undefined ? day : next.day;
    const r = next.r === undefined ? receiptId : next.r;
    void navigate({
      to: '/d/$projectId',
      params: { projectId },
      search: {
        ...(token ? { t: token } : {}),
        ...(v === 'board' ? {} : { view: v }),
        ...(d === null ? {} : { day: d }),
        ...(r === null ? {} : { r }),
      },
    });
  }

  return { projectId, token, view, day, receiptId, go };
}
