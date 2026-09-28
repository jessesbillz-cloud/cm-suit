// A board line about a daily report: its name and number, date, author, with Download PDF (the signed copy) and Open.
import { useDailyReport } from '../../../data/dailies.queries';
import { dailyHeaderSchema } from '../../../lib/dailies';
import { formatDay } from '../../../lib/dates';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { useDownload } from '../../files/useDownload';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function DailyEntity({ frame, id }: KindProps) {
  const q = useDailyReport(frame.projectId, id);
  const download = useDownload();

  if (q.isPending) return <LoadingState label="Loading the report" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const r = q.data;
  const header = dailyHeaderSchema.safeParse(r.header);
  const name = header.success ? header.data.label : 'Daily report';
  const author = header.success ? [header.data.author_name, header.data.author_company].filter((s) => s !== '').join(', ') : '';
  const fileId = r.pdf_file_id;
  const submitted = r.status === 'submitted';
  return (
    <EntityPane
      frame={frame}
      label={r.number === null ? name : `${name} #${String(r.number)}`}
      title={formatDay(r.report_date, 'EEEE, MMM d, yyyy')}
      download={
        fileId === null
          ? undefined
          : {
              label: 'Download PDF',
              loading: download.pendingId === fileId,
              onClick: () => {
                download.start(fileId);
              },
            }
      }
    >
      <Facts
        rows={[
          ['Author', author],
          [
            'Status',
            <span key="status" className="flex flex-wrap gap-2">
              <StatusChip status={submitted ? 'confirmed' : 'pending'} label={submitted ? 'Submitted' : 'Draft'} />
              {submitted && r.version !== r.signed_version ? <StatusChip status="postponed" label="Changed" /> : null}
            </span>,
          ],
        ]}
      />
    </EntityPane>
  );
}
