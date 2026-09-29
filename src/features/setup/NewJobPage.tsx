// "New job" from the job picker or "New prospect" from the bids pipeline: the setup flow on its own page. The search
// can prefill the stage and pick the tool the new job opens in. Cancel goes back where I came from.
import { getRouteApi, useNavigate, useRouter } from '@tanstack/react-router';
import { SetupFlow } from './SetupFlow';

const route = getRouteApi('/new-job');

export function NewJobPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { stage, tool } = route.useSearch();
  return (
    <SetupFlow
      stage={stage}
      openTool={tool}
      onCancel={() => {
        if (router.history.canGoBack()) router.history.back();
        else void navigate({ to: '/' });
      }}
    />
  );
}
