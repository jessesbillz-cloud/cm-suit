// The report's bottom bar. Submit (a signed record, SPEC §6.9) and what follows: Download, Send to team (the person
// presses Send; nothing goes on its own) and Copy recipients. A report changed after signing shows Update & resubmit
// instead: its stored PDF is out of date and is never offered as current.
import { useState, type ReactNode } from 'react';
import { Copy, Download, Mail, RefreshCw } from 'lucide-react';
import { useEmailDaily, useSubmitDaily } from '../../data/dailies.mutations';
import type { DailyReportRow, EmailResult } from '../../data/dailies.types';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { messageOf } from '../../data/errors';
import { useMyProjects } from '../../data/queries';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { SignButton } from '../auth/SignButton';
import { HoursPrompt } from '../hours/HoursPrompt';

interface SentLinesProps {
  result: EmailResult;
}

function SentLines({ result }: SentLinesProps) {
  return (
    <ul className="flex flex-col gap-0.5 text-[13px]" data-testid="daily-sent">
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
  projectId: string;
  report: DailyReportRow;
  recipients: readonly string[];
}

/** MDR's hours prompt after submit, on jobs that keep hours (the Hours tool is on). */
function Hours({ projectId, report }: { projectId: string; report: DailyReportRow }) {
  const jobs = useMyProjects();
  if (!jobs.data?.find((p) => p.project_id === projectId)?.modules.includes('hours')) return null;
  return (
    <div className="border-t border-line pt-3">
      <HoursPrompt key={report.id} projectId={projectId} reportId={report.id} version={report.version} hours={report.hours} />
    </div>
  );
}

function SubmittedPanel({ projectId, report, recipients }: SubmittedPanelProps) {
  const email = useEmailDaily();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const fileId = report.pdf_file_id;

  return (
    <div className="flex flex-col gap-2.5" data-testid="daily-submitted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip status="confirmed" label="Submitted" />
        <span className="min-w-0 break-all text-[13px] text-ink-2">{report.filename}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={Download}
          className="h-10"
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
          className="h-10"
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
          className="h-10"
          aria-label="Copy recipients"
          title="Copy recipients"
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
        />
      </div>
      <p className="break-words text-xs text-ink-3">{recipients.length > 0 ? `To: ${recipients.join(', ')}` : 'No recipients. Add them in Setup.'}</p>
      {email.data ? <SentLines result={email.data} /> : null}
      <Hours projectId={projectId} report={report} />
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
  /** Left of the button while writing: the autosave line. */
  aside?: ReactNode | undefined;
}

export function SubmitArea({ projectId, report, stale, ready, recipients, savedVersion, onSigned, aside }: SubmitAreaProps) {
  const submit = useSubmitDaily(projectId);
  const toast = useToast();
  const signed = () => submit.mutateAsync({ reportId: report.id, version: savedVersion() });
  const done = () => {
    toast.show({ message: 'Report submitted.' });
    onSigned();
  };

  if (report.status === 'submitted' && !stale) return <SubmittedPanel projectId={projectId} report={report} recipients={recipients} />;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {stale ? (
          <span>
            <StatusChip status="postponed" label="Changed since signed" />
          </span>
        ) : null}
        {aside}
      </div>
      <div className="ml-auto min-w-0">
        <SignButton
          label={stale ? 'Update & resubmit' : 'Submit'}
          testId="daily-submit"
          size="lg"
          icon={stale ? RefreshCw : undefined}
          pending={submit.isPending}
          disabled={!ready}
          sign={signed}
          onSigned={done}
        />
      </div>
    </div>
  );
}
