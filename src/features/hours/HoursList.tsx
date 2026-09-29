// The job's hours by day (each submitted report, opened to set its hours), by week (Monday first) or by month.
// Desktop: a table with the day, the report and the hours; phone: one stacked line per row with the hours at the right.
import { ChevronRight } from 'lucide-react';
import type { HoursDayRow } from '../../data/hours.types';
import { formatDay } from '../../lib/dates';
import { addDays, groupHours, hoursText, monthLabel } from '../../lib/timesheet';
import { Icon } from '../../ui/Icon';
import { HEAD_ROW, TABLE, TD, TD_NUM, TH, phoneRowClass, rowClass } from '../../ui/Table';
import { reportName, type HoursView } from './model';

interface Row {
  key: string;
  title: string;
  sub: string;
  hours: number | null;
  /** Days open in the right column; weeks and months are totals. */
  open: boolean;
}

function rowsOf(view: HoursView, days: readonly HoursDayRow[]): Row[] {
  if (view === 'days') {
    return days.map((d) => ({ key: d.id, title: formatDay(d.report_date, 'EEE, MMM d, yyyy'), sub: reportName(d), hours: d.hours, open: true }));
  }
  return groupHours(days, view === 'weeks' ? 'week' : 'month').map((g) => ({
    key: g.key,
    title:
      view === 'weeks'
        ? `${formatDay(g.key, 'MMM d')} – ${formatDay(addDays(g.key, 6), 'MMM d, yyyy')}`
        : monthLabel(g.key),
    sub: `${String(g.days)} ${g.days === 1 ? 'day' : 'days'}`,
    hours: g.hours,
    open: false,
  }));
}

const HEADS: Record<HoursView, [string, string]> = {
  days: ['Day', 'Report'],
  weeks: ['Week', 'Days'],
  months: ['Month', 'Days'],
};

interface HoursListProps {
  view: HoursView;
  days: readonly HoursDayRow[];
  selectedId: string | null;
  onOpen: (reportId: string) => void;
  isPhone: boolean;
}

function HoursCell({ hours }: { hours: number | null }) {
  return hours === null ? <span className="text-ink-3">—</span> : <span className="font-medium text-ink">{hoursText(hours)}</span>;
}

export function HoursList({ view, days, selectedId, onOpen, isPhone }: HoursListProps) {
  const rows = rowsOf(view, days);
  if (isPhone) {
    return (
      <ul className="divide-y divide-line" data-testid={`hours-${view}`}>
        {rows.map((r) => {
          const body = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words text-[15px] leading-6 text-ink">{r.title}</span>
                <span className="text-xs text-ink-2">{r.sub}</span>
              </span>
              <span className="shrink-0 text-lg tabular-nums">
                <HoursCell hours={r.hours} />
              </span>
            </>
          );
          return (
            <li key={r.key}>
              {r.open ? (
                <button
                  type="button"
                  data-testid="hours-row"
                  className={`${phoneRowClass(selectedId === r.key)} flex items-center gap-3`}
                  onClick={() => {
                    onOpen(r.key);
                  }}
                >
                  {body}
                </button>
              ) : (
                <div data-testid="hours-row" className="flex min-h-[56px] items-center gap-3 px-4 py-3">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  const [first, second] = HEADS[view];
  return (
    <table className={TABLE} data-testid={`hours-${view}`}>
      <thead>
        <tr className={HEAD_ROW}>
          <th className={`${TH} w-[42%] pl-4`}>{first}</th>
          <th className={TH}>{second}</th>
          <th className={`${TH} w-24 text-right`}>Hours</th>
          <th className={`${TH} w-10 pr-4`} aria-label="Open" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            data-testid="hours-row"
            aria-current={selectedId === r.key ? 'true' : undefined}
            className={r.open ? rowClass(selectedId === r.key) : 'h-[52px] border-b border-line last:border-b-0'}
            onClick={
              r.open
                ? () => {
                    onOpen(r.key);
                  }
                : undefined
            }
          >
            <td className={`${TD} pl-4 font-medium text-ink`}>
              {/* Keyboard reach: Enter on this button clicks through to the row's handler. */}
              {r.open ? (
                <button type="button" className="text-left">
                  {r.title}
                </button>
              ) : (
                r.title
              )}
            </td>
            <td className={`${TD} whitespace-normal break-words text-ink-2`}>{r.sub}</td>
            <td className={`${TD_NUM} text-right text-[15px]`}>
              <HoursCell hours={r.hours} />
            </td>
            <td className={`${TD} pr-4 text-right`}>{r.open ? <Icon icon={ChevronRight} size={16} className="text-ink-3" /> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
