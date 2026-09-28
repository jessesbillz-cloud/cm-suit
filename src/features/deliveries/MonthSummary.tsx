// The monthly summary (SPEC §13.3): deliveries by day with totals. The same table on screen and on paper.
import { formatDay } from '../../lib/dates';
import { byTime } from '../../lib/deliveries';
import type { DeliveryRow } from '../../data/deliveries.types';
import { StandbyChip, timeRange } from './DeliveryCard';

interface MonthSummaryProps {
  rows: readonly DeliveryRow[];
  tz: string;
}

export function MonthSummary({ rows, tz }: MonthSummaryProps) {
  const days = [...new Set(rows.map((r) => r.delivery_date))].sort();
  const standby = rows.filter((r) => r.standby).length;
  return (
    <table className="w-full border-collapse text-sm" data-testid="delivery-month">
      <thead>
        <tr className="border-b border-line text-left text-xs text-ink-2">
          <th className="py-2 pr-3 font-medium">Day</th>
          <th className="py-2 pr-3 font-medium">Deliveries</th>
          <th className="py-2 text-right font-medium">Count</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => {
          const list = rows.filter((r) => r.delivery_date === d).sort(byTime);
          return (
            <tr key={d} className="border-b border-line align-top">
              <td className="whitespace-nowrap py-2 pr-3 text-ink">{formatDay(d, 'EEE, MMM d')}</td>
              <td className="py-2 pr-3">
                <ul className="flex flex-col gap-1">
                  {list.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-ink">
                      <span className="tabular-nums text-ink-2">{timeRange(r, tz)}</span>
                      <span className="font-medium">{r.company}</span>
                      <span className="break-words text-ink-2">{r.description}</span>
                      <span className="text-ink-3">#{r.number}</span>
                      {r.standby ? <StandbyChip /> : null}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="py-2 text-right font-semibold tabular-nums text-ink">{list.length}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="text-ink">
          <td className="py-2 pr-3 font-semibold">Total</td>
          <td className="py-2 pr-3 text-ink-2">
            {days.length} {days.length === 1 ? 'day' : 'days'}
            {standby > 0 ? ` · ${String(standby)} standby` : ''}
          </td>
          <td className="py-2 text-right font-semibold tabular-nums" data-testid="delivery-month-total">
            {rows.length}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
