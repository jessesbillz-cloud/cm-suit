// One banner in a calendar cell (MDR's month grid): the inspection type or the line's title on a solid fill in its
// status colors (lib/status solid / onSolid), postponed with MDR's pause mark. A line with no state is a quiet neutral
// banner with its kind's icon. On a phone the grid shows only the color: a thin bar (the day below has the words).
import { Pause } from 'lucide-react';
import { CALENDAR_KINDS, isCalendarKind } from '../../lib/calendarKinds';
import { STATUS } from '../../lib/status';
import { Icon } from '../../ui/Icon';
import type { Banner as BannerData } from './entries';

interface BannerProps {
  banner: BannerData;
  /** Week columns show the time and the job over the label. */
  time?: string | undefined;
  job?: string | undefined;
}

function fill(b: BannerData) {
  return b.tone ? { background: `var(--status-${b.tone}-solid)`, color: `var(--status-${b.tone}-on-solid)` } : undefined;
}

export function Banner({ banner, time, job }: BannerProps) {
  const kind = banner.kind !== null && isCalendarKind(banner.kind) ? CALENDAR_KINDS[banner.kind] : null;
  return (
    <span
      className={`flex min-w-0 flex-col rounded-[5px] px-1.5 py-[3px] text-left ${banner.tone ? '' : 'bg-page text-ink-2'}`}
      style={fill(banner)}
    >
      {time ? <span className="text-[11px] font-medium leading-4 tabular-nums opacity-85">{time}</span> : null}
      <span className="flex min-w-0 items-start gap-1 text-[11px] font-semibold leading-[15px]">
        {banner.paused ? <Icon icon={Pause} size={11} className="mt-[2px] shrink-0" /> : null}
        {kind ? <Icon icon={kind.icon} size={11} className="mt-[2px] shrink-0" /> : null}
        <span className="min-w-0 break-words">{banner.label}</span>
      </span>
      {job ? <span className="break-words text-[11px] leading-4 opacity-85">{job}</span> : null}
      {banner.tone ? <span className="sr-only">{STATUS[banner.tone].label}</span> : null}
    </span>
  );
}

/** The phone's bar: the color only. */
export function BannerBar({ banner }: { banner: BannerData }) {
  return (
    <span
      className={`block h-[5px] w-full rounded-full ${banner.tone ? '' : 'ring-1 ring-inset ring-ink-3/70'}`}
      style={banner.tone ? { background: `var(--status-${banner.tone}-solid)` } : undefined}
    />
  );
}
