// /a/<link-id>?t=<token>: the permanent access link in every invite (SPEC §6.4 #1). The link never expires by
// itself; it tells us which address to email a code to. Signing in with that code, then accept_invites(), is what
// grants access. Once signed in, this device stays signed in.
import { useEffect, useRef, useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { sendCode, useSession } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { useAccessLink, useEnterProject, type AccessLinkInfo } from '../../data/links';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { CodeForm } from './CodeForm';
import { PublicPage } from './PublicPage';

const route = getRouteApi('/a/$linkId');

export function AccessLink() {
  const { linkId } = route.useParams();
  const { t } = route.useSearch();
  const link = useAccessLink(linkId, t ?? null);
  const session = useSession();
  const enter = useEnterProject();
  const navigate = useNavigate();
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const entering = useRef(false);

  const go = (info: AccessLinkInfo): Promise<void> =>
    enter(info).then((projectId) => {
      if (projectId) void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'board' } });
      else void navigate({ to: '/' });
    });

  // Already signed in as the invited address on this device: go straight in.
  const info = link.data;
  const sameUser = info !== undefined && session.user?.email.toLowerCase() === info.email.toLowerCase();
  useEffect(() => {
    if (!info || !sameUser || entering.current) return;
    entering.current = true;
    go(info).catch((e: unknown) => {
      entering.current = false;
      setProblem(messageOf(e));
    });
  });

  if (!t) {
    return (
      <PublicPage title="Link incomplete">
        <p className="text-sm text-ink-2">This link is missing part of its address. Open it again from the email, or ask for a new one.</p>
      </PublicPage>
    );
  }
  if (link.isPending || session.status === 'loading') {
    return (
      <PublicPage title="Opening your link">
        <LoadingState label="Checking the link" />
      </PublicPage>
    );
  }
  if (link.isError) {
    return (
      <PublicPage title="Link not active">
        <ErrorState title="This link does not work right now." error={link.error} />
      </PublicPage>
    );
  }

  const data = link.data;
  if (sameUser) {
    return (
      <PublicPage title={data.project_name}>
        {problem ? <p className="text-sm text-danger">{problem}</p> : <LoadingState label="Opening the job" />}
      </PublicPage>
    );
  }

  return (
    <PublicPage title={data.project_name}>
      {step === 'code' ? (
        <CodeForm
          email={data.email}
          emailLabel={data.email_masked}
          onVerified={() => {
            // The session listener will also see the new user; this flag keeps the effect from entering twice.
            entering.current = true;
            return go(data);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            You were invited to this job. To open it, we will email a code to{' '}
            <span className="font-medium text-ink">{data.email_masked}</span>.
          </p>
          {problem ? (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          ) : null}
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              setBusy(true);
              setProblem(null);
              sendCode(data.email)
                .then(() => {
                  setStep('code');
                })
                .catch((e: unknown) => {
                  setProblem(messageOf(e));
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            Send code
          </Button>
        </div>
      )}
    </PublicPage>
  );
}
