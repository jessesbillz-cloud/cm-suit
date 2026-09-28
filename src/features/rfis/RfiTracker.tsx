// Where is the RFI (like the inspection tracker, top to bottom for the right column): every step of its route, who did
// each and when, who has it now and for how long, whether they have even opened it, when the answer is due, and what
// comes next.
import { Check, Circle, CircleDot } from 'lucide-react';
import type { RfiDetail, RouteState } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { StatusChip } from '../../ui/StatusChip';
import { daysSince, daysText, dueText, notOpened } from './model';

const ICONS = { done: Check, current: CircleDot, next: Circle } as const;
const DOT: Record<RouteState, string> = {
  done: 'bg-accent text-white',
  current: 'bg-card text-accent ring-2 ring-accent',
  next: 'bg-card text-ink-3 ring-1 ring-line-strong',
};

interface NowProps {
  detail: RfiDetail;
  timeZone: string;
  now: Date;
}

/** The current step: who has it, how long, not opened, due. */
function Holding({ detail, timeZone, now }: NowProps) {
  const r = detail.rfi;
  const due = r.status === 'open' && r.due_at !== null ? dueText(r.due_at, timeZone, now) : null;
  const held = r.held_since === null ? null : daysText(daysSince(r.held_since, now));
  const who = detail.is_mine_to_act ? 'With you' : detail.holder_label === '' ? '' : `With ${detail.holder_label}`;
  return (
    <div className="mt-0.5 flex flex-col gap-1.5">
      <p className="text-sm text-ink-2" data-testid="rfi-holder">
        {who !== '' ? <span className={`font-medium ${detail.is_mine_to_act ? 'text-accent' : 'text-ink'}`}>{who}</span> : null}
        {who !== '' && held !== null ? ' · ' : null}
        {held}
      </p>
      {notOpened(r) || due ? (
        <div className="flex flex-wrap items-center gap-2">
          {notOpened(r) ? <StatusChip status="pending" label="Not opened" /> : null}
          {due ? (
            <span data-testid="rfi-due" className={`text-sm ${due.late ? 'font-medium text-danger' : 'text-ink-2'}`}>
              {due.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RfiTracker({ detail, timeZone, now }: NowProps) {
  const steps = detail.route;
  return (
    <ol className="flex flex-col" aria-label="Where it is" data-testid="rfi-tracker">
      {steps.map((s, i) => (
        <li key={s.position} className="relative flex gap-3 pb-3 last:pb-0" data-state={s.state}>
          {i < steps.length - 1 ? (
            <span aria-hidden className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-px ${s.state === 'done' ? 'bg-accent/40' : 'bg-line-strong'}`} />
          ) : null}
          <span className={`relative z-[1] mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ${DOT[s.state]}`}>
            <Icon icon={ICONS[s.state]} size={12} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-sm ${s.state === 'current' ? 'font-semibold text-ink' : s.state === 'done' ? 'text-ink' : 'text-ink-3'}`}>{s.label}</span>
              {s.state === 'done' && s.done_at !== null ? (
                <span className="shrink-0 text-xs tabular-nums text-ink-2">{formatInZone(s.done_at, timeZone, 'MMM d')}</span>
              ) : null}
            </div>
            {s.state === 'done' && s.done_by_name !== null ? <p className="text-xs text-ink-2">{s.done_by_name}</p> : null}
            {s.state === 'current' ? <Holding detail={detail} timeZone={timeZone} now={now} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
