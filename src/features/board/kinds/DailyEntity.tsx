// A board line about a daily report: its name and number, date, author, with View (the PDF full screen), Download PDF
// and Open. A report changed
// since it was signed offers its signed copy, labelled as such; its author is sent to Update & resubmit instead (MDR:
// an out-of-date report never goes out).
import { useUser } from '../../../data/auth';
import { useDailyReport } from '../../../data/dailies.queries';
import { usePreviewFetch } from '../../../data/preview';
import { dailyHeaderSchema } from '../../../lib/dailies';
import { formatDay } from '../../../lib/dates';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { useFileViewer } from '../../../ui/FileViewer';
import { pdfOffer, reportChip } from '../../dailies/model';
import { dailyPdfItem } from '../../dailies/pdfItem';
import { useDownload } from '../../files/useDownload';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function DailyEntity({ frame, id }: KindProps) {
  const q = useDailyReport(frame.projectId, id);
  const download = useDownload();
  const user = useUser();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();

  if (q.isPending) return <LoadingState label="Loading the report" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const r = q.data;
  const header = dailyHeaderSchema.safeParse(r.header);
  const name = header.success ? header.data.label : 'Daily report';
  const author = header.success ? [header.data.author_name, header.data.author_company].filter((s) => s !== '').join(', ') : '';
  const fileId = r.pdf_file_id;
  const chip = reportChip(r);
  const offer = pdfOffer(r, r.author_id === user.id);
  const shown = fileId !== null && offer !== 'resubmit' ? fileId : null;
  return (
    <EntityPane
      frame={frame}
      label={r.number === null ? name : `${name} #${String(r.number)}`}
      title={formatDay(r.report_date, 'EEEE, MMM d, yyyy')}
      view={
        shown === null
          ? undefined
          : () => {
              viewer.open([dailyPdfItem(r, shown, preview)]);
            }
      }
      download={
        fileId === null || offer === 'resubmit'
          ? undefined
          : {
              label: offer === 'signed' ? 'Download signed copy' : 'Download PDF',
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
              <StatusChip status={chip.status} label={chip.label} />
            </span>,
          ],
          offer === 'signed' ? ['PDF', 'Changed since signed'] : null,
          offer === 'resubmit' ? ['PDF', 'Changed since signed: open it, then Update & resubmit'] : null,
        ]}
      />
    </EntityPane>
  );
}
