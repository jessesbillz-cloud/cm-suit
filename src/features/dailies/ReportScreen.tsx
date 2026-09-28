// An opened daily report (right column on desktop, full screen on the phone). The author gets the editor; someone
// reading the job's submitted reports (dailies.read_all) gets the signed PDF.
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useDailyPhotos, useDailyReport, useDailySetup, useNextDailyNumber } from '../../data/dailies.queries';
import type { DailyReportRow } from '../../data/dailies.types';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { dailyContentSchema, dailyHeaderSchema, parseDailySettings, type DailyHeader } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { ReportEditor } from './ReportEditor';

interface SignedCopyProps {
  report: DailyReportRow;
  header: DailyHeader;
}

/** Someone else's submitted report: who, when, and the signed PDF in one click. */
function SignedCopy({ report, header }: SignedCopyProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const fileId = report.pdf_file_id;
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold text-ink">
        {header.label} <span className="tabular-nums text-ink-2">#{report.number}</span>
      </h2>
      <p className="text-sm text-ink-2">
        {formatDay(report.report_date, 'EEE, MMM d, yyyy')} · {header.author_name}
      </p>
      {fileId === null ? (
        <EmptyState title="No PDF yet." />
      ) : (
        <Button
          icon={Download}
          className="w-fit"
          loading={busy}
          onClick={() => {
            setBusy(true);
            downloadFile(fileId)
              .catch((e: unknown) => {
                toast.show({ tone: 'error', message: downloadErrorMessage(e) });
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          Download
        </Button>
      )}
    </div>
  );
}

interface ReportScreenProps {
  projectId: string;
  reportId: string;
  isPhone: boolean;
}

export function ReportScreen({ projectId, reportId, isPhone }: ReportScreenProps) {
  const user = useUser();
  const report = useDailyReport(projectId, reportId);
  const mine = report.data?.author_id === user.id;
  const photos = useDailyPhotos(projectId, reportId);
  const setup = useDailySetup(projectId);
  const next = useNextDailyNumber(projectId, mine);
  // Bumped by Reload after a conflict: the editor starts over from the saved report.
  const [generation, setGeneration] = useState(0);

  if (report.isPending) return <LoadingState label="Loading report" />;
  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const header = dailyHeaderSchema.safeParse(report.data.header);
  const content = dailyContentSchema.safeParse(report.data.content);
  if (!header.success || !content.success) {
    return <ErrorState error={new Error('This report could not be read.')} title="This report did not load." />;
  }
  if (!mine) return <SignedCopy report={report.data} header={header.data} />;

  if (photos.isPending || setup.isPending) return <LoadingState label="Loading report" />;
  if (photos.isError) return <ErrorState error={photos.error} onRetry={() => void photos.refetch()} />;
  if (setup.isError) return <ErrorState error={setup.error} onRetry={() => void setup.refetch()} />;

  return (
    <ReportEditor
      // A new signature starts the editor over from the signed version.
      key={`${report.data.id}:${String(report.data.signed_version ?? 0)}:${String(generation)}`}
      projectId={projectId}
      report={report.data}
      header={header.data}
      content={content.data}
      photos={photos.data}
      nextNumber={next.data}
      recipients={parseDailySettings(setup.data?.settings).recipients}
      isPhone={isPhone}
      onSigned={() => void report.refetch()}
      onReload={() => {
        void report.refetch().then(() => {
          setGeneration((g) => g + 1);
        });
      }}
    />
  );
}
