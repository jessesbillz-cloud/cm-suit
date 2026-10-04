// An opened daily report (right column on desktop, full screen on the phone). The author gets the editor; someone
// reading the job's submitted reports (dailies.read_all) gets the signed PDF. The editor shows the form as the job's
// company uses it (lib/dailies reportForm: a draft follows the company's form, a submitted report keeps the form it
// was signed on).
import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useUser } from '../../data/auth';
import { useCompanyForms, useDailyPhotos, useDailyReport, useDailySetups, useNextDailyNumber } from '../../data/dailies.queries';
import type { DailyReportRow } from '../../data/dailies.types';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { useProject } from '../../data/queries';
import {
  DAILY_REPORT_TYPE,
  dailyContentSchema,
  dailyHeaderSchema,
  formOf,
  parseDailySettings,
  reportForm,
  type DailyHeader,
} from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { reportChip } from './model';
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
  const chip = reportChip(report);
  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
          <span className="break-words">{header.label}</span>
          <span className="tabular-nums text-ink-2">#{report.number}</span>
          <StatusChip status={chip.status} label={chip.label} />
        </h2>
        <p className="text-sm text-ink-2">
          {formatDay(report.report_date, 'EEEE, MMM d, yyyy')} · {header.author_name}
        </p>
      </header>
      {fileId === null ? (
        <EmptyState icon={TOOL_META.dailies.icon} title="No PDF yet." />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-line p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-page text-ink-2">
            <Icon icon={FileText} size={20} />
          </span>
          <p className="min-w-0 flex-1 break-all text-sm font-medium text-ink">{report.filename}</p>
          <Button
            variant="primary"
            icon={Download}
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
        </div>
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
  const setups = useDailySetups(projectId);
  const reportType = report.data?.report_type ?? DAILY_REPORT_TYPE;
  const next = useNextDailyNumber(projectId, reportType, mine);
  const project = useProject(projectId);
  const company = useCompanyForms(project.data?.org_id);
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

  if (photos.isError) return <ErrorState error={photos.error} onRetry={() => void photos.refetch()} />;
  if (setups.isError) return <ErrorState error={setups.error} onRetry={() => void setups.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (company.isError) return <ErrorState error={company.error} onRetry={() => void company.refetch()} />;
  if (photos.isPending || setups.isPending || company.isPending) return <LoadingState label="Loading report" />;
  const setup = setups.data.find((s) => s.report_type === reportType);
  const builtIn = formOf(reportType);
  const form = builtIn === null ? null : reportForm(builtIn, report.data, company.data.forms[reportType] ?? null);
  if (builtIn !== null && form === null) {
    return <ErrorState error={new Error('This report could not be read.')} title="This report did not load." />;
  }

  return (
    <ReportEditor
      // A new signature starts the editor over from the signed version.
      key={`${report.data.id}:${String(report.data.signed_version ?? 0)}:${String(generation)}`}
      projectId={projectId}
      report={report.data}
      header={header.data}
      content={content.data}
      form={form}
      photos={photos.data}
      nextNumber={next.data}
      recipients={parseDailySettings(setup?.settings).recipients}
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
