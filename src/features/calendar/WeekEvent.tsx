// One entry in a week column (Jesse, Oct 23, Hunter Hall: "it's a little hard to read"): a white box with a thick bar
// in its status color (lib/status), the time on the left, the title in the display face and one line of who or where.
// A request's title is its type with its IR number; a line's is its own title. Postponed wears the pause mark, a line
// with no state its kind's icon. Nothing is cut off: words wrap.
import { Pause } from 'lucide-react';
import { CALENDAR_KINDS, isCalendarKind } from '../../lib/calendarKinds';
import { STATUS } from '../../lib/status';
import { Icon } from '../../ui/Icon';
import { clockLabel } from '../inspections/time';
import { bannerOf, type Entry } from './entries';
import { lineTime } from './model';

interface WeekEventProps {
  entry: Entry;
  showJob: boolean;
  onOpen: (entry: Entry) => void;
}

/** "9:30" over "AM" on the left; a word (All day, Flexible, Time TBD) over the title instead. */
function timeParts(e: Entry): [string, string | null] {
  const t = e.type === 'line' ? lineTime(e.line) : e.row.duration_kind === 'all_day' ? 'All day' : clockLabel(e.row.start_time);
  const m = /^(\d{1,2}:\d{2}) ([AP]M)$/.exec(t);
  return m?.[1] && m[2] ? [m[1], m[2]] : [t, null];
}

/** Who or where, in one line: the company (a request) or the place (a line), and the job on "All my jobs". */
function whoOf(e: Entry, showJob: boolean): string {
  const parts = e.type === 'ir' ? [e.row.company] : [e.line.location];
  if (showJob) parts.push(e.projectName);
  return parts.filter((v): v is string => v !== null && v !== '').join(' · ');
}

export function WeekEvent({ entry, showJob, onOpen }: WeekEventProps) {
  const banner = bannerOf(entry);
  const kind = banner.kind !== null && isCalendarKind(banner.kind) ? CALENDAR_KINDS[banner.kind] : null;
  const [time, half] = timeParts(entry);
  const who = whoOf(entry, showJob);
  const number = entry.type === 'ir' && !entry.row.is_block && entry.row.number !== null ? `IR ${String(entry.row.number)}` : null;
  return (
    <button
      type="button"
      data-testid="cal-line"
      className="flex w-full min-w-0 gap-2 rounded-card border border-l-[5px] border-line bg-card px-2 py-1.5 text-left shadow-tile transition-shadow hover:shadow-tile-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      style={banner.tone ? { borderLeftColor: `var(--status-${banner.tone}-solid)` } : undefined}
      onClick={() => {
        onOpen(entry);
      }}
    >
      {half ? (
        <span className="flex w-9 shrink-0 flex-col pt-px text-[12px] font-semibold leading-4 tabular-nums text-ink">
          {time}
          <span className="text-[10px] font-medium text-ink-2">{half}</span>
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        {half ? null : <span className="text-[11px] font-semibold leading-4 text-ink-2">{time}</span>}
        <span className="flex min-w-0 items-start gap-1">
          {banner.paused ? <Icon icon={Pause} size={12} className="mt-[3px] shrink-0 text-ink-2" /> : null}
          {kind ? <Icon icon={kind.icon} size={12} className="mt-[3px] shrink-0 text-ink-2" /> : null}
          <span className="heading min-w-0 break-words text-[14px] font-semibold leading-5 text-ink">{banner.label}</span>
        </span>
        {number ? <span className="text-[11px] font-medium leading-4 tabular-nums text-ink-2">{number}</span> : null}
        {who !== '' ? <span className="break-words text-[12px] leading-4 text-ink-2">{who}</span> : null}
      </span>
      {banner.tone ? <span className="sr-only">{STATUS[banner.tone].label}</span> : null}
    </button>
  );
}
