// My contract hours on the job: Contract / Used / Remaining (MDR's table), a bar for how far along it is, and the
// baseline it started from. An overrun reads in red. Edit opens the form; without contract hours, one button sets them.
import { Pencil, Target } from 'lucide-react';
import { formatDay } from '../../lib/dates';
import { hoursText, usedPercent, type BudgetRow } from '../../lib/timesheet';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';

interface BudgetCardProps {
  budget: BudgetRow | null;
  onEdit: () => void;
}

interface FigureProps {
  label: string;
  value: number;
  testId: string;
  danger?: boolean;
}

function Figure({ label, value, testId, danger = false }: FigureProps) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[12px] font-bold uppercase tracking-wide text-ink">{label}</span>
      <span data-testid={testId} className={`text-2xl font-semibold tabular-nums leading-8 ${danger ? 'text-danger' : 'text-ink'}`}>
        {hoursText(value)}
      </span>
    </div>
  );
}

/** A bar for how much of the contract is used; full and red past it. */
export function UsedBar({ used, contract }: { used: number; contract: number }) {
  const pct = usedPercent(used, contract);
  const over = used > contract;
  return (
    <div
      role="meter"
      aria-label="Contract hours used"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 w-full overflow-hidden rounded-full bg-page"
    >
      <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${String(pct)}%` }} />
    </div>
  );
}

export function BudgetCard({ budget, onEdit }: BudgetCardProps) {
  if (budget === null) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">No contract hours yet.</p>
          <Button icon={Target} data-testid="hours-contract-set" onClick={onEdit}>
            Set contract hours
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <Card
      title="Contract hours"
      actions={
        <Button size="sm" variant="quiet" icon={Pencil} data-testid="hours-contract-open" onClick={onEdit}>
          Edit
        </Button>
      }
    >
      <div className="flex flex-col gap-3" data-testid="hours-budget">
        <div className="grid grid-cols-3 gap-3">
          <Figure label="Contract" value={budget.contract} testId="hours-contract" />
          <Figure label="Used" value={budget.used} testId="hours-used" />
          <Figure label="Remaining" value={budget.remaining} testId="hours-remaining" danger={budget.remaining < 0} />
        </div>
        <UsedBar used={budget.used} contract={budget.contract} />
        {budget.baseline > 0 && budget.baselineThrough !== null ? (
          <p className="text-xs text-ink-2">
            Includes {hoursText(budget.baseline)} h through {formatDay(budget.baselineThrough, 'MMM d, yyyy')}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
