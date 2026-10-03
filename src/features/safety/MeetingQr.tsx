// The QR the crew scans to sign in (the leader's screen, while the meeting is open): big, with the link under it, Copy
// and Print (one Letter page). The server keeps only the token's hash, so the QR shows on the device that made it; any
// other device makes a new one ("Show QR here"), which stops the old one at once. Sign-in ends 18 hours after the start.
import { useState } from 'react';
import { Copy, Printer, QrCode as QrIcon, RefreshCw } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useMeetingQr } from '../../data/safety.mutations';
import type { LinkToken, Meeting } from '../../data/safety.types';
import { rememberedLink, rememberLink } from '../../lib/requestLink';
import { meetingLabel, meetingLinkKey, meetingLinkUrl, SIGNIN_HOURS } from '../../lib/safety';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { QrCode, QrSheet } from '../inspections/QrSheet';
import { useCopyLink } from '../inspections/useCopyLink';

interface MeetingQrProps {
  projectId: string;
  meeting: Meeting;
  jobName: string;
}

export function MeetingQr({ projectId, meeting, jobName }: MeetingQrProps) {
  const qr = useMeetingQr(projectId, meeting.id);
  const copy = useCopyLink();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  // Just made here (the meeting's own row catches up on its next read).
  const [fresh, setFresh] = useState<LinkToken | null>(null);
  const key = meetingLinkKey(meeting.id);
  const kept = rememberedLink(key, meeting.token_made_at);
  // The one made here counts until the row shows a newer one (another device's New QR).
  const stillFresh = fresh !== null && (meeting.token_made_at === null || Date.parse(meeting.token_made_at) <= Date.parse(fresh.token_made_at));
  const token = kept?.token ?? (stillFresh ? fresh.token : null);
  const url = token ? meetingLinkUrl(window.location.origin, __BASE_PATH__, meeting.id, token) : null;
  const ended = Date.now() - Date.parse(meeting.opened_at) > SIGNIN_HOURS * 3_600_000;

  function make(replacing: boolean) {
    qr.mutate(undefined, {
      onSuccess: (made) => {
        rememberLink(key, { token: made.token, made_at: made.token_made_at });
        setFresh(made);
        if (replacing) toast.show({ message: 'New QR. The old one no longer works.' });
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: `No QR: ${messageOf(e)}` });
      },
    });
  }

  if (ended) {
    return (
      <p className="rounded-card border border-line bg-card-head px-4 py-3 text-sm text-ink-2" data-testid="safety-qr-ended">
        Sign-in ended. Close the meeting.
      </p>
    );
  }
  return (
    <section className="flex flex-col items-center gap-3 rounded-card border border-line bg-card-head px-4 py-5 text-center" data-testid="safety-qr">
      {url ? (
        <>
          <span className="block w-full max-w-[300px] rounded-lg bg-white p-1 shadow-card">
            <QrCode text={url} className="aspect-square w-full" />
          </span>
          <p className="text-[15px] font-semibold text-ink">Scan to sign in</p>
          <p className="max-w-full break-all font-mono text-[12px] leading-5 text-ink-2" data-testid="safety-link">
            {url}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon={Copy} onClick={() => { copy(url); }}>
              Copy link
            </Button>
            <Button icon={Printer} data-testid="safety-print-qr" onClick={() => { setSheet(true); }}>
              Print QR
            </Button>
            <Button variant="quiet" icon={RefreshCw} loading={qr.isPending} onClick={() => { make(true); }}>
              New QR
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2">{meeting.token_made_at ? 'The QR is on another device.' : 'No QR yet.'}</p>
          <Button variant="primary" icon={QrIcon} loading={qr.isPending} data-testid="safety-show-qr" onClick={() => { make(false); }}>
            Show QR here
          </Button>
        </>
      )}
      {sheet && url ? (
        <QrSheet
          over={`${jobName} · ${meetingLabel(meeting.kind, meeting.number)}: ${meeting.title}`}
          title="Sign in"
          url={url}
          onClose={() => {
            setSheet(false);
          }}
        />
      ) : null}
    </section>
  );
}
