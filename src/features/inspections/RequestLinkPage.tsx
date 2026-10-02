// /r/<job>?t=<token> (and ?h=<hub> from the hub): the job's request link, the QR sheet's target (SPEC §6.4 #4). Anyone
// requests an inspection right here with no login (PublicRequest, 0055). A member who may request goes straight to the
// app's form; "Sign in to see all your requests" joins as a Requester with the email code (JoinForm).
import { useEffect, useRef, useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useSession } from '../../data/auth';
import { useOpenRequestLink } from '../../data/requestLink';
import type { LinkKey } from '../../data/requestLink.types';
import { ErrorState, LoadingState } from '../../ui/States';
import { PublicPage } from '../auth/PublicPage';
import { JoinForm } from './JoinForm';
import { NEW_ITEM } from './model';
import { PublicRequest } from './PublicRequest';

const route = getRouteApi('/r/$projectId');

export function RequestLinkPage() {
  const { projectId } = route.useParams();
  const { t, h } = route.useSearch();
  const session = useSession();
  const navigate = useNavigate();
  const [signIn, setSignIn] = useState(false);
  const linkKey: LinkKey | null = t ? { projectId, token: t, hubId: h ?? null } : null;
  const ready = session.status !== 'loading';
  const open = useOpenRequestLink(ready ? linkKey : null, session.user?.id ?? null);
  const going = useRef(false);

  const answer = open.data && !open.isPlaceholderData ? open.data : null;
  useEffect(() => {
    if (!answer?.member || going.current) return;
    going.current = true;
    if (answer.can_request) {
      void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId: NEW_ITEM }, replace: true });
    } else {
      void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'board' }, replace: true });
    }
  });

  if (!linkKey) {
    return (
      <PublicPage title="Link incomplete">
        <p className="text-sm text-ink-2">Scan the code again, or ask for the link.</p>
      </PublicPage>
    );
  }
  if (!ready || open.isPending) {
    return (
      <PublicPage title="Opening the link">
        <LoadingState label="Checking the link" />
      </PublicPage>
    );
  }
  if (open.isError) {
    return (
      <PublicPage title="Link not active">
        <ErrorState title="This link does not work right now." error={open.error} className="m-0" />
      </PublicPage>
    );
  }
  if (open.data.member) {
    return (
      <PublicPage title={open.data.project_name}>
        <LoadingState label="Opening the job" />
      </PublicPage>
    );
  }
  if (signIn) {
    return (
      <PublicPage title={open.data.project_name} meta="Sign in to see all your requests">
        <JoinForm linkKey={linkKey} signedInAs={session.user?.email ?? null} />
        <button
          type="button"
          className="self-center py-2 text-sm font-medium text-accent hover:underline"
          onClick={() => {
            setSignIn(false);
          }}
        >
          Back to the request
        </button>
      </PublicPage>
    );
  }
  return (
    <PublicRequest
      linkKey={linkKey}
      projectName={open.data.project_name}
      onSignIn={() => {
        setSignIn(true);
      }}
    />
  );
}
