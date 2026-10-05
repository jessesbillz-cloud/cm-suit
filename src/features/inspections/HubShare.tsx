// "All my jobs": one link for every job where I take inspection requests (MDR's hub). Anyone who decides inspections
// has one (0046). Making a new one ends the old one at once, with Undo in the toast (0075, as the job link); the
// server keeps only its hash, so it shows on the device that made it (lib/requestLink).
import { useState } from 'react';
import { Copy, Link2, QrCode, RefreshCw } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRotateRequestHub, useUndoRequestHub } from '../../data/requestLink.mutations';
import { useRequestHubState } from '../../data/requestLink.queries';
import type { HubState } from '../../data/requestLink.types';
import { forgetLink, HUB_LINK_KEY, hubUrl, rememberLink, rememberedLink } from '../../lib/requestLink';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { QrSheet } from './QrSheet';
import { useCopyLink } from './useCopyLink';

function HubBody({ state }: { state: HubState }) {
  const rotate = useRotateRequestHub();
  const undo = useUndoRequestHub();
  const toast = useToast();
  const copyUrl = useCopyLink();
  const [sheet, setSheet] = useState(false);
  const made = state.hub_id !== null;
  const copy = made ? rememberedLink(HUB_LINK_KEY, state.made_at) : null;
  const url = copy?.id ? hubUrl(window.location.origin, __BASE_PATH__, copy.id, copy.token) : null;

  function make() {
    const previous = copy;
    rotate.mutate(undefined, {
      onSuccess: (hub) => {
        rememberLink(HUB_LINK_KEY, { token: hub.token, made_at: hub.made_at, id: hub.hub_id });
        if (!made) {
          toast.show({ message: 'Link made.' });
          return;
        }
        toast.show({
          message: 'New link made. The old one no longer works.',
          action: {
            label: 'Undo',
            onClick: () => {
              undo.mutate(undefined, {
                onSuccess: () => {
                  if (previous) rememberLink(HUB_LINK_KEY, previous);
                  else forgetLink(HUB_LINK_KEY);
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
    <section className="flex flex-col gap-4 border-t border-line pt-4" data-testid="hub-share">
      <div>
        <h2 className="text-sm font-semibold text-ink">All my jobs</h2>
        <p className="text-[13px] text-ink-2">{state.jobs === 1 ? '1 job taking requests' : `${String(state.jobs)} jobs taking requests`}</p>
      </div>
      {url ? (
        <>
          <p className="break-all rounded-lg border border-line bg-card-head px-3 py-2.5 font-mono text-[13px] text-ink" data-testid="hub-url">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={QrCode}
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
      ) : made ? (
        <p className="text-[13px] text-ink-2">Made on another device.</p>
      ) : null}
      <div>
        <Button
          variant={url ? 'quiet' : 'secondary'}
          icon={made ? RefreshCw : Link2}
          loading={rotate.isPending}
          data-testid="hub-make"
          onClick={make}
        >
          {made ? 'New link' : 'Make link'}
        </Button>
      </div>
      {sheet && url ? (
        <QrSheet
          url={url}
          onClose={() => {
            setSheet(false);
          }}
        />
      ) : null}
    </section>
  );
}

export function HubShare() {
  const state = useRequestHubState();
  if (state.isError) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  if (state.isPending) return <LoadingState label="Loading the link" />;
  if (!state.data.decides) return null;
  return <HubBody state={state.data} />;
}
