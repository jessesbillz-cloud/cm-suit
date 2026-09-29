// The month on screen as the timesheet prints it: hours by job and day (weekends shaded, totals per job and per day),
// and the contract table (Contract / Used / Remaining through the month's end). Phone: one stacked line per job.
import type { MonthHours } from '../../data/hours.queries';
import { hoursText, monthSpan, weekdayOf, type BudgetRow, type MonthProject } from '../../lib/timesheet';
import { HEAD_ROW, TABLE, TD, TD_NUM, TH } from '../../ui/Table';
import { UsedBar } from '../hours/BudgetCard';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface GridProps {
  month: string;
  hours: MonthHours;
  isPhone: boolean;
}

function dayList(month: string): { d: number; weekend: boolean; letter: string }[] {
  const span = monthSpan(month);
  return Array.from({ length: span.days }, (_, i) => {
    const w = weekdayOf(`${month}-${String(i + 1).padStart(2, '0')}`);
    return { d: i + 1, weekend: w === 0 || w === 6, letter: WEEKDAY[w] ?? '' };
  });
}

function PhoneJobs({ grid }: { grid: readonly MonthProject[] }) {
  return (
    <ul className="divide-y divide-line">
      {grid.map((p) => {
        const days = Object.keys(p.days).length;
        return (
          <li key={p.projectId} className="flex min-h-[56px] items-center gap-3 px-4 py-3" data-testid="month-job">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="break-words text-[15px] leading-6 text-ink">{p.name}</span>
              <span className="text-xs text-ink-2">
                {days} {days === 1 ? 'day' : 'days'}
              </span>
            </span>
            <span className="shrink-0 text-lg font-medium tabular-nums text-ink">{hoursText(p.total)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function HoursGrid({ month, hours, isPhone }: GridProps) {
  if (isPhone) return <PhoneJobs grid={hours.grid} />;
  const days = dayList(month);
  const shade = (weekend: boolean) => (weekend ? 'bg-page/70' : '');
  const cell = 'px-0 text-center text-[12px] tabular-nums';
  return (
    <div className="overflow-x-auto">
      <table className={`${TABLE} min-w-[760px]`} data-testid="month-grid">
        <thead>
          <tr className={HEAD_ROW}>
            <th className={`${TH} w-44 pl-4`}>Job</th>
            {days.map((x) => (
              <th key={x.d} className={`h-12 ${cell} font-medium text-ink-3 ${shade(x.weekend)}`}>
                <span className="block leading-4">{x.d}</span>
                <span className="block text-[10px] leading-3">{x.letter}</span>
              </th>
            ))}
            <th className={`${TH} w-16 pr-4 text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {hours.grid.map((p) => (
            <tr key={p.projectId} className="h-[52px] border-b border-line" data-testid="month-job">
              <td className={`${TD} whitespace-normal break-words pl-4 font-medium text-ink`}>{p.name}</td>
              {days.map((x) => (
                <td key={x.d} className={`${cell} text-ink ${shade(x.weekend)}`}>
                  {p.days[x.d] === undefined ? '' : hoursText(p.days[x.d] ?? 0)}
                </td>
              ))}
              <td className={`${TD_NUM} pr-4 text-right text-[15px] font-semibold text-ink`}>{hoursText(p.total)}</td>
            </tr>
          ))}
          <tr className="h-[48px] bg-card-head">
            <td className={`${TD} pl-4 text-[12px] font-medium uppercase tracking-wide text-ink-3`}>Total</td>
            {days.map((x) => {
              const sum = hours.grid.reduce((s, p) => s + (p.days[x.d] ?? 0), 0);
              return (
                <td key={x.d} className={`${cell} font-medium text-ink-2 ${shade(x.weekend)}`}>
                  {sum > 0 ? hoursText(sum) : ''}
                </td>
              );
            })}
            <td className={`${TD_NUM} pr-4 text-right text-[15px] font-semibold text-ink`} data-testid="month-total">
              {hoursText(hours.total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface ContractProps {
  budgets: readonly BudgetRow[];
  isPhone: boolean;
}

export function ContractTable({ budgets, isPhone }: ContractProps) {
  if (isPhone) {
    return (
      <ul className="divide-y divide-line">
        {budgets.map((b) => (
          <li key={b.projectId} className="flex flex-col gap-2 px-4 py-3" data-testid="contract-row">
            <span className="break-words text-[15px] leading-6 text-ink">{b.name}</span>
            <UsedBar used={b.used} contract={b.contract} />
            <span className="text-xs tabular-nums text-ink-2">
              {hoursText(b.used)} of {hoursText(b.contract)} h ·{' '}
              <span className={b.remaining < 0 ? 'text-danger' : ''}>
                {b.remaining < 0 ? `${hoursText(-b.remaining)} over` : `${hoursText(b.remaining)} left`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <table className={TABLE}>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${TH} pl-4`}>Job</th>
          <th className={`${TH} w-24 text-right`}>Contract</th>
          <th className={`${TH} w-24 text-right`}>Used</th>
          <th className={`${TH} w-28 text-right`}>Remaining</th>
          <th className={`${TH} w-40 pr-4`} aria-label="Used" />
        </tr>
      </thead>
      <tbody>
        {budgets.map((b) => (
          <tr key={b.projectId} className="h-[52px] border-b border-line last:border-b-0" data-testid="contract-row">
            <td className={`${TD} whitespace-normal break-words pl-4 font-medium text-ink`}>{b.name}</td>
            <td className={`${TD_NUM} text-right text-ink-2`}>{hoursText(b.contract)}</td>
            <td className={`${TD_NUM} text-right text-ink-2`}>{hoursText(b.used)}</td>
            <td className={`${TD_NUM} text-right font-semibold ${b.remaining < 0 ? 'text-danger' : 'text-ink'}`}>{hoursText(b.remaining)}</td>
            <td className={`${TD} pr-4`}>
              <UsedBar used={b.used} contract={b.contract} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
