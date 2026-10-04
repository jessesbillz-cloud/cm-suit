// One activity on two tight lines: the whole name (a flag before a milestone) with its dates at the right, then the
// Activity ID, the area, the trade and how far along it is. A tap opens it beside the list.
import { Flag } from 'lucide-react';
import type { Activity } from '../../data/schedule.types';
import { Icon } from '../../ui/Icon';
import { phoneRowClass } from '../../ui/Table';
import { dateSpan } from './model';

interface ActivityRowProps {
  activity: Activity;
  selected: boolean;
  onOpen: (id: string) => void;
}

function facts(a: Activity): string {
  const done = a.actual_finish !== null || (a.percent ?? 0) >= 100;
  const pct = done ? 'Done' : a.percent !== null && a.percent > 0 ? `${String(Math.round(a.percent))}%` : null;
  return [a.activity_code, a.area, a.trade, pct].filter((x): x is string => x !== null && x !== '').join(' · ');
}

export function ActivityRow({ activity: a, selected, onOpen }: ActivityRowProps) {
  const line = facts(a);
  return (
    <li>
      <button
        type="button"
        data-testid={`schedule-row-${a.activity_code ?? a.id}`}
        aria-current={selected ? 'true' : undefined}
        className={`${phoneRowClass(selected)} flex flex-col gap-0.5 sm:py-2.5 ${selected ? '' : 'hover:bg-page/60'}`}
        onClick={() => {
          onOpen(a.id);
        }}
      >
        <span className="flex w-full items-start gap-3">
          <span className="flex min-w-0 flex-1 items-start gap-1.5 whitespace-normal break-words text-[15px] leading-6 text-ink">
            {a.is_milestone ? <Icon icon={Flag} size={15} label="Milestone" className="mt-[5px] shrink-0 text-accent" /> : null}
            <span className="min-w-0">{a.name}</span>
          </span>
          <span className="shrink-0 pt-0.5 text-[13px] tabular-nums text-ink-2">{dateSpan(a)}</span>
        </span>
        {line ? <span className="text-[13px] leading-5 text-ink-3">{line}</span> : null}
      </button>
    </li>
  );
}
