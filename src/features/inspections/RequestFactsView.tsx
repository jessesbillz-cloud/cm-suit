// A request sent through the link, as its visitor sees it (the receipt and the status link): the IR number the database
// gave, when and what type, the tracker (Submitted → (GC) → Inspector → Result; an OFS request adds OFS, from the
// answer's ofs_sent), the inspector's attendance call, the postponement (why, the note, the expected day) and the result
// line. Nothing about anyone else.
import type { RequestFacts } from '../../data/requestNoLogin.types';
import { formatDay } from '../../lib/dates';
import { StatusChip } from '../../ui/StatusChip';
import { attendanceLabel, postponeLabel, requestChip, resultLabel, trackerSteps, typeLabel, waitingOn } from './model';
import { clockLabel, durationLabel } from './time';
import { Tracker } from './Tracker';

function Line({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <div className="px-3 py-2.5" data-testid={testId}>
      <p className="text-xs font-medium text-ink-3">{label}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{text}</p>
    </div>
  );
}

export function RequestFactsView({ facts }: { facts: RequestFacts }) {
  const chip = requestChip({ status: facts.status, result: facts.result, helper_id: null, kind: facts.kind, ofs_sent: facts.ofs_sent });
  const result = resultLabel(facts.result);
  const attendance = attendanceLabel(facts.attendance);
  const postponed = facts.status === 'postponed';
  const waiting = waitingOn(facts);
  const postponeText = [
    [postponeLabel(facts.postpone_reason), facts.postpone_until ? `expected ${formatDay(facts.postpone_until, 'EEE, MMM d')}` : '']
      .filter((v) => v !== '')
      .join(' · '),
    facts.postpone_note ?? '',
  ]
    .filter((v) => v !== '')
    .join('\n');
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-2xl font-semibold tabular-nums text-ink" data-testid="public-ir-number">
          IR {facts.number}
        </h2>
        <p className="text-sm text-ink">
          {formatDay(facts.request_date, 'EEE, MMM d')} · {clockLabel(facts.start_time)} · {durationLabel(facts.duration_kind, facts.duration_min)}
        </p>
        <p className="break-words text-sm text-ink-2">{typeLabel(facts.kind, facts.special_kind)}</p>
      </div>
      <div className="rounded-lg bg-page/70 px-1 py-3">
        <Tracker
          steps={trackerSteps({ status: facts.status, result: facts.result, gc_at: null, kind: facts.kind, ofs_sent: facts.ofs_sent }, facts.gc_step)}
        />
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2" data-testid="public-ir-status">
        <StatusChip status={chip.status} label={chip.label} />
        {waiting}
      </p>
      {attendance || postponed || result ? (
        <div className="divide-y divide-line rounded-lg border border-line">
          {attendance ? <Line label="Attendance" text={attendance} testId="public-ir-attendance" /> : null}
          {postponed ? <Line label="Postponed" text={postponeText || 'Postponed'} testId="public-ir-postponed" /> : null}
          {result ? <Line label="Result" text={facts.result_note ? `${result}\n${facts.result_note}` : result} testId="public-ir-result" /> : null}
        </div>
      ) : null}
    </div>
  );
}
