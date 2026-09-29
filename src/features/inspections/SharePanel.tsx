// Share (inspections): the job's request link (SPEC §6.4 #4, members.manage) and, for people who take requests, one
// link for all their jobs (HubShare). Make it, or a new one (the old link and every QR sheet printed from it stop
// working at once; Undo on the toast), copy it, print the QR sheet. The server keeps only its hash, so the link shows on
// the device that made it (lib/requestLink).
import { useState } from 'react';
import { Copy, Link2, QrCode, RefreshCw } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRotateRequestLink, useUndoRequestLink } from '../../data/requestLink.mutations';
import { useRequestLinkState } from '../../data/requestLink.queries';
import type { RequestLinkState } from '../../data/requestLink.types';
import { formatInZone } from '../../lib/dates';
import { forgetLink, rememberLink, rememberedLink, requestLinkKey, requestLinkUrl } from '../../lib/requestLink';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { HubShare } from './HubShare';
import { QrSheet } from './QrSheet';
import { useCopyLink } from './useCopyLink';
import { useIrAccess, type IrJob } from './useIrAccess';

interface BodyProps {
  job: IrJob;
  state: RequestLinkState;
}

function ShareBody({ job, state }: BodyProps) {
  const rotate = useRotateRequestLink(job.id);
  const undo = useUndoRequestLink(job.id);
  const toast = useToast();
  const copyUrl = useCopyLink();
  const [sheet, setSheet] = useState(false);
  const key = requestLinkKey(job.id);
  const copy = state.active ? rememberedLink(key, state.since) : null;
  const url = copy ? requestLinkUrl(window.location.origin, __BASE_PATH__, job.id, copy.token) : null;

  function make() {
    const previous = copy;
    rotate.mutate(undefined, {
      onSuccess: (made) => {
        rememberLink(key, made);
        toast.show({
          message: state.active ? 'New link made. The old one no longer works.' : 'Link made.',
          action: {
            label: 'Undo',
            onClick: () => {
              undo.mutate(undefined, {
                onSuccess: () => {
                  if (previous) rememberLink(key, previous);
                  else forgetLink(key);
                },
                onError: (e) => {
                  toast.show({ tone: 'error', message: `Not undone: ${messageOf(e)}` });
                },
              });
            },
          },
        });
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: `No new link: ${messageOf(e)}` });
      },
    });
  }

  return (
    <section className="flex flex-col gap-4" data-testid="ir-share">
      <h2 className="text-sm font-semibold text-ink">This job</h2>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${state.active ? 'bg-accent-soft text-accent' : 'bg-page text-ink-3'}`}
        >
          <Icon icon={QrCode} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink" data-testid="request-link-state">
            {state.active ? 'Request link on' : 'No request link'}
          </p>
          {state.active && state.since ? (
            <p className="text-[13px] text-ink-2">Since {formatInZone(state.since, job.tz, 'MMM d, yyyy')}</p>
          ) : null}
        </div>
      </div>
      {url ? (
        <>
          <p className="break-all rounded-lg border border-line bg-card-head px-3 py-2.5 font-mono text-[13px] text-ink" data-testid="request-link-url">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={QrCode}
              data-testid="request-qr"
              onClick={() => {
                setSheet(true);
              }}
            >
              QR sheet
            </Button>
            <Button
              icon={Copy}
              onClick={() => {
                copyUrl(url);
              }}
            >
              Copy link
            </Button>
          </div>
        </>
      ) : state.active ? (
        <p className="text-[13px] text-ink-2">Made on another device.</p>
      ) : null}
      <div className={state.active ? 'border-t border-line pt-4' : ''}>
        <Button
          variant={!state.active ? 'primary' : url ? 'quiet' : 'secondary'}
          icon={state.active ? RefreshCw : Link2}
          loading={rotate.isPending}
          data-testid="request-link-make"
          onClick={make}
        >
          {state.active ? 'New link' : 'Make link'}
        </Button>
      </div>
      {sheet && url ? (
        <QrSheet
          over={job.name}
          url={url}
          onClose={() => {
            setSheet(false);
          }}
        />
      ) : null}
    </section>
  );
}

function JobShare({ job }: { job: IrJob }) {
  const state = useRequestLinkState(job.id);
  if (state.isError) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  if (state.isPending) return <LoadingState label="Loading the link" />;
  return <ShareBody key={job.id} job={job} state={state.data} />;
}

export function SharePanel({ projectId }: { projectId: string }) {
  const access = useIrAccess(projectId);
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  if (access.state === 'loading') return <LoadingState label="Loading the link" />;
  const { can, job } = access;
  if (!can.share && !can.decide) return <ErrorState error={new Error('Only people who run the job or take requests share links.')} />;
  return (
    <div className="flex flex-col gap-6 p-4">
      {can.share ? <JobShare job={job} /> : null}
      {can.decide ? <HubShare /> : null}
    </div>
  );
}
