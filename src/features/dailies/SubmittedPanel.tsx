// A submitted report, up to date (MDR's success screen, at the top of the report instead of a tall pinned footer):
// Submitted and the filename, Download, View (the PDF full screen) and Email to project team (the person presses it;
// nothing goes on its own) with Copy recipients, who it goes to (or a link to Setup), the sent lines, and the hours
// chips under it on jobs that keep hours.
import { Copy, Download, Eye, Mail } from 'lucide-react';
import { useEmailDaily } from '../../data/dailies.mutations';
import type { DailyReportRow, EmailResult } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import { usePreviewFetch } from '../../data/preview';
import { useMyProjects } from '../../data/queries';
import { Button } from '../../ui/Button';
import { useFileViewer } from '../../ui/FileViewer';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { useDownload } from '../files/useDownload';
import { HoursPrompt } from '../hours/HoursPrompt';
import { SETUP_ITEM } from './model';
import { dailyPdfItem } from './pdfItem';
import { useDailiesNav } from './useDailiesNav';

function SentLines({ result }: { result: EmailResult }) {
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

interface SubmittedPanelProps {
  projectId: string;
  report: DailyReportRow;
  recipients: readonly string[];
}

export function SubmittedPanel({ projectId, report, recipients }: SubmittedPanelProps) {
  const email = useEmailDaily();
  const toast = useToast();
  const download = useDownload();
  const nav = useDailiesNav(projectId);
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const fileId = report.pdf_file_id;

  return (
    <section className="flex flex-col gap-2.5 rounded-card bg-card p-4 shadow-card" data-testid="daily-submitted">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip status="confirmed" label="Submitted" />
        <span className="min-w-0 break-all text-[13px] text-ink-2">{report.filename}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={Download}
          className="h-10"
          loading={fileId !== null && download.pendingId === fileId}
          disabled={fileId === null}
          data-testid="daily-download"
          onClick={() => {
            if (fileId !== null) download.start(fileId);
          }}
        >
          Download
        </Button>
        <Button
          icon={Eye}
          className="h-10"
          disabled={fileId === null}
          data-testid="daily-view"
          onClick={() => {
            if (fileId !== null) viewer.open([dailyPdfItem(report, fileId, preview)]);
          }}
        >
          View
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
          Email to project team
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
      {recipients.length > 0 ? (
        <p className="break-words text-xs text-ink-3">To: {recipients.join(', ')}</p>
      ) : (
        <p className="text-xs text-ink-3">
          No recipients.{' '}
          <button
            type="button"
            className="font-medium text-accent underline-offset-2 hover:underline"
            data-testid="daily-recipients-setup"
            onClick={() => {
              nav.open(SETUP_ITEM);
            }}
          >
            Setup
          </button>
        </p>
      )}
      {email.data ? <SentLines result={email.data} /> : null}
      <Hours projectId={projectId} report={report} />
    </section>
  );
}
