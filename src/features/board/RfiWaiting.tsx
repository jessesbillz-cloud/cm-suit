// The top of "Needs you": RFIs I sent or may issue that someone else is sitting on, late first, then the ones nobody
// has opened for days ("Not opened · 5 days", "2 days late"). A click opens the RFI where it lives.
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import type { RfiWaitingRow } from '../../data/rfis.types';
import { entityTarget } from '../../lib/entityTarget';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { rfiLabel, waitingText } from '../rfis/model';
import { NeedsRow } from './NeedsRow';

interface RfiWaitingLineProps {
  row: RfiWaitingRow;
  showJob: boolean;
  zone: string;
  now: Date;
}

export function RfiWaitingLine({ row, showJob, zone, now }: RfiWaitingLineProps) {
  const openTarget = useOpenTarget();
  const target = entityTarget('rfi', row.id);
  const who = row.holder_label === '' ? '' : `With ${row.holder_label}`;
  return (
    <NeedsRow
      testId="needs-you-rfi"
      reason={row.reason}
      icon={TOOL_META.rfis.icon}
      title={
        <>
          <span className="font-medium tabular-nums">{rfiLabel(row.number)}</span> · {row.title}
        </>
      }
      meta={[showJob ? row.project_name : '', who].filter((s) => s !== '').join(' · ')}
      end={<StatusChip status={row.reason === 'late' ? 'blocked' : 'pending'} label={waitingText(row, zone, now)} />}
      onOpen={() => {
        if (target) openTarget(row.project_id, target);
      }}
    />
  );
}
