// The top of "Needs you": RFIs I sent or may issue that someone else is sitting on, late first, then the ones nobody
// has opened for days ("Not opened · 5 days", "2 days late"). A click opens the RFI where it lives.
import { FileQuestion } from 'lucide-react';
import { useOpenTarget } from '../../app/frame/useOpenTarget';
import type { RfiWaitingRow } from '../../data/rfis.types';
import { entityTarget } from '../../lib/entityTarget';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { rfiLabel, waitingText } from '../rfis/model';

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
    <li data-testid="needs-you-rfi" data-reason={row.reason}>
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-page"
        onClick={() => {
          if (target) openTarget(row.project_id, target);
        }}
      >
        <Icon icon={FileQuestion} size={16} className="mt-0.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm text-ink">
            <span className="font-medium tabular-nums">{rfiLabel(row.number)}</span> · {row.title}
          </span>
          <span className="block text-xs text-ink-2">{[showJob ? row.project_name : '', who].filter((s) => s !== '').join(' · ')}</span>
        </span>
        <StatusChip status={row.reason === 'late' ? 'blocked' : 'pending'} label={waitingText(row, zone, now)} />
      </button>
    </li>
  );
}
