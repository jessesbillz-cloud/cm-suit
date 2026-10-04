// A request sent through the link, as its visitor sees it (the receipt and the status link): the IR number the database
// gave, when and what type, the tracker (Submitted → (GC) → Inspector → Result; an OFS request adds OFS, from the
// answer's ofs_sent) and the result line. Nothing about anyone else.
import type { RequestFacts } from '../../data/requestNoLogin.types';
import { formatDay } from '../../lib/dates';
import { StatusChip } from '../../ui/StatusChip';
import { requestChip, resultLabel, trackerSteps, typeLabel, waitingOn } from './model';
import { clockLabel, durationLabel } from './time';
import { Tracker } from './Tracker';

export function RequestFactsView({ facts }: { facts: RequestFacts }) {
  const chip = requestChip({ status: facts.status, result: facts.result, helper_id: null, kind: facts.kind, ofs_sent: facts.ofs_sent });
  const result = resultLabel(facts.result);
  const waiting = waitingOn(facts);
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
      {result ? (
        <div className="rounded-lg border border-line px-3 py-2.5" data-testid="public-ir-result">
          <p className="text-xs font-medium text-ink-3">Result</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">
            {result}
            {facts.result_note ? `\n${facts.result_note}` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}
