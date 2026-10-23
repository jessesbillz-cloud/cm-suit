// The OFS part of an RFI, an RFI document or a submittal, wherever it opens (Files, RFIs, For review): the Fire / life
// safety box for whoever may mark it, then what OFS decided (green or red), "OFS: Waiting" while it is with him, and the
// two boxes for the fire marshal. Nothing at all on an item that is not marked and not mine to mark.
import { useOfsItem, type MarkInput } from '../../data/ofs';
import { StatusChip } from '../../ui/StatusChip';
import { ErrorState } from '../../ui/States';
import { useProjectZones } from '../board/zones';
import { DecideBoxes } from './DecideBoxes';
import { DecisionBox } from './DecisionBox';
import { MarkToggle } from './MarkToggle';

interface OfsPanelProps {
  projectId: string;
  target: MarkInput['target'] | { itemId: string };
}

export function OfsPanel({ projectId, target }: OfsPanelProps) {
  const item = useOfsItem(target);
  const zoneOf = useProjectZones();
  // A part of a pane that has its own loading line: nothing until it knows.
  if (item.isPending) return null;
  if (item.isError) return <ErrorState error={item.error} title="OFS did not load." onRetry={() => void item.refetch()} className="m-0" />;
  const it = item.data;
  if (it === null) return null;
  const markTarget: MarkInput['target'] | null =
    'itemId' in target ? (it.rfi_id ? { rfiId: it.rfi_id } : it.file_id ? { fileId: it.file_id } : null) : target;
  const id = it.id;
  return (
    <section className="flex flex-col gap-3" data-testid="ofs-panel">
      {it.may_mark && markTarget !== null ? <MarkToggle projectId={projectId} target={markTarget} item={it} /> : null}
      {it.decision ? <DecisionBox decision={it.decision} history={it.history} zone={zoneOf(projectId)} /> : null}
      {it.decision === null && it.sent && !it.may_decide ? (
        <span data-testid="ofs-waiting" className="self-start">
          <StatusChip status="pending" label="OFS: Waiting" />
        </span>
      ) : null}
      {it.may_decide && id !== null ? <DecideBoxes projectId={projectId} item={{ ...it, id }} /> : null}
    </section>
  );
}
