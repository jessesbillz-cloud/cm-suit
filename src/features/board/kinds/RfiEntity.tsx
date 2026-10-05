// A board line about an RFI: its number and title, where it is (status, who has it and how long, not opened, due),
// who asked, the question, an impact claim when there is one, the PDF (View full screen, through the rfis function's
// own gate, and one-click download), and Open in RFIs. Reading it here as the holder counts as opening it.
import { TriangleAlert } from 'lucide-react';
import { DataError, messageOf } from '../../../data/errors';
import { rfiPdfViewUrl, useRfiPdf } from '../../../data/rfis.mutations';
import { useRfiDetail } from '../../../data/rfis.queries';
import { useFileViewer } from '../../../ui/FileViewer';
import { Icon } from '../../../ui/Icon';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { useToast } from '../../../ui/Toast';
import { daysSince, daysText, dueText, impactKinds, notOpened, rfiLabel, statusChip } from '../../rfis/model';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

function gone(e: unknown): boolean {
  return e instanceof DataError && (e.code === 'P0002' || e.code === 'PGRST116');
}

export function RfiEntity({ frame, id }: KindProps) {
  const q = useRfiDetail(frame.projectId, id);
  const pdf = useRfiPdf();
  const toast = useToast();
  const viewer = useFileViewer();

  if (q.isPending) return <LoadingState label="Loading the RFI" />;
  if (q.isError && gone(q.error)) return <EntityPane frame={{ ...frame, open: null }} label="RFI" title="This RFI isn't here." />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const d = q.data;
  const r = d.rfi;
  const chip = statusChip(r.status);
  const now = new Date();
  const due = r.status === 'open' && r.due_at !== null ? dueText(r.due_at, frame.zone, now) : null;
  const held = d.holder_label !== '' && r.held_since !== null ? `${d.holder_label} · ${daysText(daysSince(r.held_since, now))}` : null;
  return (
    <EntityPane
      frame={frame}
      label={rfiLabel(r.number)}
      title={r.title}
      view={() => {
        viewer.open([
          {
            id: `rfi-pdf:${r.id}`,
            name: `${rfiLabel(r.number)}.pdf`,
            kind: 'pdf',
            url: () => rfiPdfViewUrl(r.id),
            download: () => pdf.mutateAsync(r),
          },
        ]);
      }}
      download={{
        label: 'PDF',
        loading: pdf.isPending,
        onClick: () => {
          pdf.mutate(r, {
            onError: (e) => {
              toast.show({ tone: 'error', message: messageOf(e) });
            },
          });
        },
      }}
    >
      <Facts
        rows={[
          ['Status', <StatusChip key="status" status={chip.status} label={chip.label} />],
          ['With', held === null ? null : (
            <span key="with" className="inline-flex flex-wrap items-center gap-2">
              {held}
              {notOpened(r) ? <StatusChip status="pending" label="Not opened" /> : null}
            </span>
          )],
          ['Due', due === null ? null : <span key="due" className={due.late ? 'font-medium text-danger' : ''}>{due.text}</span>],
          ['From', d.originator_name],
        ]}
      />
      <p className="whitespace-pre-wrap break-words">{r.question}</p>
      {r.impact_claimed_at !== null ? (
        <p className="flex items-center gap-2 rounded-md border border-impact-edge bg-impact-row px-3 py-2 font-medium" data-testid="rfi-entity-impact">
          <Icon icon={TriangleAlert} size={16} className="text-impact-ink" />
          Impact claimed · {impactKinds(r.impact_cost, r.impact_time)}
        </p>
      ) : null}
    </EntityPane>
  );
}
