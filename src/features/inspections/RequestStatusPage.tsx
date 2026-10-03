// /r/<job>/s/<receipt>: a request sent with no login, by its private status link (0055). The tracker and the
// inspector's result line; on a request with walls, its map (0057): Download map, and Edit map until the inspector
// records a result. The request itself can't be changed from here (a later version may let the visitor move or
// withdraw it).
import { getRouteApi } from '@tanstack/react-router';
import { useRequestStatus } from '../../data/requestNoLogin';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { PublicPage } from '../auth/PublicPage';
import { PublicMap } from './PublicMap';
import { PublicRequestShell } from './PublicRequestShell';
import { RequestFactsView } from './RequestFactsView';

const route = getRouteApi('/r/$projectId/s/$receipt');

export function RequestStatusPage() {
  const { projectId, receipt } = route.useParams();
  const status = useRequestStatus(projectId, receipt);

  if (status.isPending) {
    return (
      <PublicPage title="Inspection request">
        <LoadingState label="Checking the request" />
      </PublicPage>
    );
  }
  // A failed refetch keeps the page (and a map being drawn) on screen; only a first answer that fails says so.
  if (status.data === undefined) {
    return (
      <PublicPage title="Not available">
        <ErrorState title="Check the link, or ask the inspector." error={status.error} className="m-0" />
      </PublicPage>
    );
  }
  return (
    <PublicRequestShell title={status.data.project_name} meta="Inspection request">
      <Card>
        <div className="flex flex-col gap-4">
          <div data-testid="public-status">
            <RequestFactsView facts={status.data} />
          </div>
          <PublicMap projectId={projectId} receipt={receipt} />
        </div>
      </Card>
    </PublicRequestShell>
  );
}
