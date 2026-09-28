// Submit (a signed record, SPEC §6.9) and what follows: Download, Send to team (the person presses Send; nothing goes
// on its own) and Copy recipients. A report changed after signing shows Update & resubmit instead: its stored PDF is
// out of date and is never offered as current.
import { useState } from 'react';
import { Copy, Download, Mail, RefreshCw } from 'lucide-react';
import { useEmailDaily, useSubmitDaily } from '../../data/dailies.mutations';
import type { DailyReportRow, EmailResult } from '../../data/dailies.types';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { SignButton } from '../auth/SignButton';

interface SentLinesProps {
  result: EmailResult;
}

function SentLines({ result }: SentLinesProps) {
  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid="daily-sent">
      {result.deliveries.map((d) =>
        d.status === 'failed' || d.status === 'suppressed' ? (
          <li key={d.email} className="text-danger">
            {d.email}: not sent.{' '}
            <a className="underline" href={d.mailto}>
              Open mail app
            </a>
          </li>
        ) : (
          <li key={d.email} className="text-ink-2">
            Sent to {d.email}
          </li>
        ),
      )}
    </ul>
  );
}

interface SubmittedPanelProps {
  report: DailyReportRow;
  recipients: readonly string[];
}

function SubmittedPanel({ report, recipients }: SubmittedPanelProps) {
  const email = useEmailDaily();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const fileId = report.pdf_file_id;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-page p-3" data-testid="daily-submitted">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <StatusChip status="confirmed" label="Submitted" />
        <span className="break-all text-ink-2">{report.filename}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={Download}
          loading={downloading}
          disabled={fileId === null}
          data-testid="daily-download"
          onClick={() => {
            if (fileId === null) return;
            setDownloading(true);
            downloadFile(fileId)
              .catch((e: unknown) => {
                toast.show({ tone: 'error', message: downloadErrorMessage(e) });
              })
              .finally(() => {
                setDownloading(false);
              });
          }}
        >
          Download
        </Button>
        <Button
          icon={Mail}
          loading={email.isPending}
          disabled={recipients.length === 0}
          data-testid="daily-email"
          onClick={() => {
            email.mutate(report.id, {
              onError: (e) => {
                toast.show({ tone: 'error', message: `Not sent: ${messageOf(e)}` });
              },
            });
          }}
        >
          Send to team
        </Button>
        <Button
          variant="quiet"
          icon={Copy}
          disabled={recipients.length === 0}
          onClick={() => {
            navigator.clipboard.writeText(recipients.join(', ')).then(
              () => {
                toast.show({ message: 'Recipients copied.' });
              },
              (e: unknown) => {
                toast.show({ tone: 'error', message: `Not copied: ${messageOf(e)}` });
              },
            );
          }}
        >
          Copy recipients
        </Button>
      </div>
      <p className="break-words text-xs text-ink-2">{recipients.length > 0 ? `To: ${recipients.join(', ')}` : 'No recipients. Add them in Setup.'}</p>
      {email.data ? <SentLines result={email.data} /> : null}
    </div>
  );
}

interface SubmitAreaProps {
  projectId: string;
  report: DailyReportRow;
  stale: boolean;
  /** Everything typed is saved and no photo is still uploading. */
  ready: boolean;
  recipients: readonly string[];
  /** The saved version the signature covers. */
  savedVersion: () => number;
  onSigned: () => void;
}

export function SubmitArea({ projectId, report, stale, ready, recipients, savedVersion, onSigned }: SubmitAreaProps) {
  const submit = useSubmitDaily(projectId);
  const toast = useToast();
  const signed = () => submit.mutateAsync({ reportId: report.id, version: savedVersion() });
  const done = () => {
    toast.show({ message: 'Report submitted.' });
    onSigned();
  };

  if (report.status === 'submitted' && !stale) return <SubmittedPanel report={report} recipients={recipients} />;
  return (
    <div className="flex flex-col gap-2">
      {stale ? (
        <p className="text-sm">
          <StatusChip status="postponed" label="Changed since signed" />
        </p>
      ) : null}
      <SignButton
        label={stale ? 'Update & resubmit' : 'Submit'}
        testId="daily-submit"
        icon={stale ? RefreshCw : undefined}
        pending={submit.isPending}
        disabled={!ready}
        sign={signed}
        onSigned={done}
      />
    </div>
  );
}
