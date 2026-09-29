// /h/<hub>?t=<token>: one link for all the jobs a person takes inspection requests on (MDR's hub). Each job opens its
// request page with the hub's own token (RequestLinkPage).
import { getRouteApi, Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useRequestHub } from '../../data/requestLink';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { PublicPage } from '../auth/PublicPage';

const route = getRouteApi('/h/$hubId');

export function HubPage() {
  const { hubId } = route.useParams();
  const { t } = route.useSearch();
  const hub = useRequestHub(hubId, t ?? null);

  if (!t) {
    return (
      <PublicPage title="Link incomplete">
        <p className="text-sm text-ink-2">Scan the code again, or ask for the link.</p>
      </PublicPage>
    );
  }
  if (hub.isPending) {
    return (
      <PublicPage title="Request an inspection">
        <LoadingState label="Loading the jobs" />
      </PublicPage>
    );
  }
  if (hub.isError) {
    return (
      <PublicPage title="Link not active">
        <ErrorState title="This link does not work right now." error={hub.error} />
      </PublicPage>
    );
  }
  return (
    <PublicPage title="Request an inspection" meta="Pick the job">
      {hub.data.jobs.length === 0 ? (
        <EmptyState title="No jobs are taking requests right now." />
      ) : (
        <ul className="-mx-2 flex flex-col" data-testid="hub-jobs">
          {hub.data.jobs.map((j) => (
            <li key={j.project_id}>
              <Link
                to="/r/$projectId"
                params={{ projectId: j.project_id }}
                search={{ t, h: hubId }}
                className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2.5 text-base font-medium text-ink hover:bg-page"
              >
                <span className="min-w-0 flex-1 break-words">{j.name}</span>
                <Icon icon={ChevronRight} size={18} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PublicPage>
  );
}
