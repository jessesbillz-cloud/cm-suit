// The job's delivery link (SPEC §6.4 #3), for deliveries.manage: make a new link (the old one stops working; Undo on
// the toast), copy it, print the poster with its QR code (the one QR drawing, inspections' QrCode). Only the link's
// hash is stored, so the link itself shows once, right here.
import { useState } from 'react';
import { Copy, Link2, Printer } from 'lucide-react';
import { useDeliveryLinkState } from '../../data/deliveries.queries';
import { useRotateDeliveryLink, useUndoDeliveryLink } from '../../data/deliveries.mutations';
import { messageOf } from '../../data/errors';
import { formatInZone } from '../../lib/dates';
import { deliveryLinkUrl } from '../../lib/deliveries';
import { shortLinkText } from '../../lib/requestLink';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { QrCode } from '../inspections/QrSheet';
import { PrintSheet } from './PrintSheet';

interface LinkPanelProps {
  projectId: string;
  projectName: string;
  tz: string;
}

interface PosterProps {
  projectName: string;
  url: string;
}

const PAGE_CSS = '@page { size: letter portrait; margin: 0.5in; }';

/** The poster for the job site (MDR: poster, QR code or bookmark): the job, the QR code, the link. One Letter page. */
function Poster({ projectName, url }: PosterProps) {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 text-center print:min-h-[9.5in]" data-testid="delivery-poster">
      <style>{PAGE_CSS}</style>
      <p className="break-words text-2xl font-medium text-ink-2">{projectName}</p>
      <h1 className="text-5xl font-bold text-ink sm:text-7xl print:text-7xl">Deliveries</h1>
      <p className="text-2xl text-ink">Post your delivery and check the board</p>
      <QrCode text={url} />
      <p className="text-xl text-ink">Scan with your phone camera</p>
      <p className="max-w-full break-all font-mono text-[13px] text-ink-2">{shortLinkText(url)}</p>
    </div>
  );
}

export function LinkPanel({ projectId, projectName, tz }: LinkPanelProps) {
  const state = useDeliveryLinkState(projectId);
  const rotate = useRotateDeliveryLink(projectId);
  const undo = useUndoDeliveryLink(projectId);
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [poster, setPoster] = useState(false);

  if (state.isPending) {
    return (
      <Card>
        <LoadingState label="Loading the link" />
      </Card>
    );
  }
  if (state.isError) return <ErrorState error={state.error} onRetry={() => void state.refetch()} />;
  const replacing = state.data.active;

  const make = () => {
    rotate.mutate(undefined, {
      onSuccess: (token) => {
        setUrl(deliveryLinkUrl(window.location.origin, __BASE_PATH__, projectId, token));
        toast.show({
          message: replacing ? 'New link made. The old one no longer works.' : 'Link made.',
          action: {
            label: 'Undo',
            onClick: () => {
              setUrl(null);
              undo.mutate(undefined, {
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
  };

  return (
    <Card title="Delivery link">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${state.data.active ? 'bg-accent-soft text-accent' : 'bg-page text-ink-3'}`}>
            <Icon icon={Link2} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink" data-testid="delivery-link-state">
              {state.data.active ? 'On' : 'No link yet'}
            </p>
            {state.data.active && state.data.since ? (
              <p className="text-[13px] text-ink-2">Since {formatInZone(state.data.since, tz, 'MMM d, yyyy')}</p>
            ) : null}
          </div>
          <Button variant={replacing ? 'secondary' : 'primary'} icon={Link2} loading={rotate.isPending} onClick={make}>
            {replacing ? 'New link' : 'Make link'}
          </Button>
        </div>
        {url ? (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="break-all rounded-lg border border-line bg-card-head px-3 py-2.5 font-mono text-sm text-ink" data-testid="delivery-link-url">
              {url}
            </p>
            <p className="text-xs text-ink-2">Shown once. Copy or print it now.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                icon={Copy}
                onClick={() => {
                  navigator.clipboard.writeText(url).then(
                    () => {
                      toast.show({ message: 'Link copied.' });
                    },
                    (e: unknown) => {
                      toast.show({ tone: 'error', message: `Could not copy: ${messageOf(e)}` });
                    },
                  );
                }}
              >
                Copy link
              </Button>
              <Button icon={Printer} onClick={() => {
                  setPoster(true);
                }}>
                Poster
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {poster && url ? (
        <PrintSheet
          onClose={() => {
            setPoster(false);
          }}
        >
          <Poster projectName={projectName} url={url} />
        </PrintSheet>
      ) : null}
    </Card>
  );
}
