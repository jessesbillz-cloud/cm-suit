// A board line about an inspection request: IR number, type and company, when, status (with the result), the result
// note, what to inspect, with Download IR (when made) and Open in Inspections.
import { messageOf } from '../../../data/errors';
import { useDownloadIrFile } from '../../../data/inspections.mutations';
import { useIrRequest } from '../../../data/inspections.queries';
import { useCapability } from '../../../data/queries';
import { formatDay } from '../../../lib/dates';
import { ErrorState, LoadingState } from '../../../ui/States';
import { StatusChip } from '../../../ui/StatusChip';
import { useToast } from '../../../ui/Toast';
import { requestChip, typeLabel } from '../../inspections/model';
import { clockLabel, durationLabel } from '../../inspections/time';
import { EntityPane, Facts, type KindProps } from '../EntityPane';

export function InspectionEntity({ frame, id }: KindProps) {
  const q = useIrRequest(frame.projectId, id);
  // The deputy reads an OFS request sent to OFS as Pending; everyone else as "With OFS".
  const ofsDecide = useCapability(frame.projectId, 'ir.ofs_decide');
  const download = useDownloadIrFile();
  const toast = useToast();

  if (q.isPending) return <LoadingState label="Loading the inspection" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data === null) return <EntityPane frame={{ ...frame, open: null }} label="Inspection" title="This inspection isn't here." />;

  const r = q.data;
  const chip = requestChip(r, ofsDecide.data === true);
  return (
    <EntityPane
      frame={frame}
      label={`IR ${String(r.number)}`}
      title={`${typeLabel(r.kind, r.ir_special_kinds?.name ?? null)} · ${r.company}`}
      download={
        r.ir_file_id
          ? {
              label: 'Download IR',
              loading: download.isPending,
              onClick: () => {
                download.mutate(
                  { requestId: r.id },
                  {
                    onError: (e) => {
                      toast.show({ tone: 'error', message: messageOf(e) });
                    },
                  },
                );
              },
            }
          : undefined
      }
    >
      <Facts
        rows={[
          ['When', `${formatDay(r.request_date, 'EEE, MMM d')} · ${clockLabel(r.start_time)} · ${durationLabel(r.duration_kind, r.duration_min)}`],
          ['Status', <StatusChip key="status" status={chip.status} label={chip.label} />],
          // The chip already says Approved / Not approved; the note is what the result adds.
          ['Result', r.result_note],
          ['Items', r.items],
        ]}
      />
    </EntityPane>
  );
}
