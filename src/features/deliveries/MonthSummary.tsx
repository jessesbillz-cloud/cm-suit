// The monthly summary (SPEC §13.3): deliveries by day with totals. The same table on screen and on paper.
import { formatDay } from '../../lib/dates';
import { byTime } from '../../lib/deliveries';
import type { DeliveryRow } from '../../data/deliveries.types';
import { HEAD_ROW, TD, TD_NUM, TH } from '../../ui/Table';
import { StandbyChip, timeRange } from './DeliveryCard';

/** A day can hold several deliveries: its cells read from the top. */
const CELL = 'px-3 py-3 align-top';

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
        <tr className={HEAD_ROW}>
          <th className={`${TH} w-32 pl-4 sm:w-36`}>Day</th>
          <th className={TH}>Deliveries</th>
          <th className={`${TH} w-20 pr-4 text-right`}>Count</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => {
          const list = rows.filter((r) => r.delivery_date === d).sort(byTime);
          return (
            <tr key={d} className="border-b border-line">
              <td className={`${CELL} whitespace-nowrap pl-4 font-medium text-ink`}>{formatDay(d, 'EEE, MMM d')}</td>
              <td className={CELL}>
                <ul className="flex flex-col gap-1.5">
                  {list.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink">
                      <span className="w-28 shrink-0 tabular-nums text-ink-2">{timeRange(r, tz)}</span>
                      <span className="min-w-0 wrap-anywhere font-medium">{r.company}</span>
                      <span className="min-w-0 wrap-anywhere text-ink-2">{r.description}</span>
                      <span className="tabular-nums text-ink-3">#{r.number}</span>
                      {r.standby ? <StandbyChip /> : null}
                    </li>
                  ))}
                </ul>
              </td>
              <td className={`${CELL} pr-4 text-right font-semibold tabular-nums text-ink`}>{list.length}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="bg-card-head text-ink">
          <td className={`${TD} pl-4 font-semibold`}>Total</td>
          <td className={`${TD} text-ink-2`}>
            {days.length} {days.length === 1 ? 'day' : 'days'}
            {standby > 0 ? ` · ${String(standby)} standby` : ''}
          </td>
          <td className={`${TD_NUM} pr-4 text-right font-semibold`} data-testid="delivery-month-total">
            {rows.length}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
