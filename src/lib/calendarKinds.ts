// Calendar line kinds (SPEC §7.6): ONE table of label + icon, used by the calendar, its type filter and Settings.
// And ONE mapping from a mirrored line's source to the tool that opens it.
import { AlarmClock, CalendarRange, ClipboardCheck, Construction, Flag, ShieldCheck, Truck, Users, type LucideIcon } from 'lucide-react';
import { CALENDAR_TYPES, type Tool } from './layout';

type CalendarKind = (typeof CALENDAR_TYPES)[number];

export const CALENDAR_KINDS: Record<CalendarKind, { label: string; icon: LucideIcon }> = {
  inspections: { label: 'Inspections', icon: ClipboardCheck },
  special_inspections: { label: 'Special inspections', icon: ShieldCheck },
  deliveries: { label: 'Deliveries', icon: Truck },
  meetings: { label: 'Meetings', icon: Users },
  pours: { label: 'Pours / shutdowns', icon: Construction },
  milestones: { label: 'Milestones', icon: Flag },
  lookahead: { label: 'Look-ahead', icon: CalendarRange },
  my_due: { label: 'My due items', icon: AlarmClock },
};

/** The kinds a person adds by hand (calendar.manage). The rest come from their modules. */
export const MANUAL_KINDS = ['meetings', 'pours', 'milestones', 'lookahead'] as const satisfies readonly CalendarKind[];

export function isCalendarKind(v: string): v is CalendarKind {
  return (CALENDAR_TYPES as readonly string[]).includes(v);
}

/** Label for any kind string from the database; an unknown one is shown as written. */
export function kindLabel(kind: string): string {
  return isCalendarKind(kind) ? CALENDAR_KINDS[kind].label : kind;
}

/** Mirrored lines: calendar_entries.source_type -> the tool that owns the row. */
const SOURCE_TOOL: Record<string, Tool> = {
  delivery: 'deliveries',
  inspection_request: 'inspections',
  correction: 'corrections',
  daily_report: 'dailies',
  project_bid_due: 'bids',
};

/** Sources whose line opens the tool itself, not an item in it (the job's bid time is the job, not a row). */
const OPENS_TOOL_ONLY = new Set(['project_bid_due']);

interface LineTarget {
  tool: Tool;
  /** null: open the tool, not an item. */
  itemId: string | null;
}

/** Where clicking a line goes: a manual line opens in the calendar; a mirrored one opens its module item. */
export function lineTarget(line: { id: string; source_type: string; source_id: string | null }): LineTarget | null {
  if (line.source_type === 'manual') return { tool: 'calendar', itemId: line.id };
  const tool = SOURCE_TOOL[line.source_type];
  if (!tool) return null;
  if (OPENS_TOOL_ONLY.has(line.source_type)) return { tool, itemId: null };
  return line.source_id ? { tool, itemId: line.source_id } : null;
}
