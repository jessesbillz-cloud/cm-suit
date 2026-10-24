// The board's lines grouped by the day they happened on their job's clock (Jesse, Oct 23: easier to read), newest day
// first, each under its heading (Today, Yesterday, then the date). The lines keep the feed's order inside a day.
import type { BoardLine } from '../../data/types';
import { dayHeading, formatInZone } from '../../lib/dates';

interface BoardDay {
  day: string;
  heading: string;
  lines: BoardLine[];
}

export function groupByDay(lines: readonly BoardLine[], zoneOf: (projectId: string) => string, now: Date = new Date()): BoardDay[] {
  const days = new Map<string, BoardDay>();
  for (const l of lines) {
    const zone = zoneOf(l.project_id);
    const day = formatInZone(l.created_at, zone, 'yyyy-MM-dd');
    const group = days.get(day) ?? { day, heading: dayHeading(day, zone, now), lines: [] };
    group.lines.push(l);
    days.set(day, group);
  }
  return [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
}
