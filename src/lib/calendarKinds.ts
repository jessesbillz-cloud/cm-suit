// Calendar line kinds (SPEC §7.6): ONE table of label + icon, used by the calendar, its type filter and Settings.
// A mirrored line opens its source's item through lib/entityTarget (the board's mapping too).
import { AlarmClock, CalendarRange, ClipboardCheck, Construction, Flag, ShieldCheck, Truck, Users, type LucideIcon } from 'lucide-react';
import { entityTarget, type EntityTarget } from './entityTarget';
import { CALENDAR_TYPES } from './layout';

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

/**
 * Where clicking a line goes: a manual line opens in the calendar; a mirrored one opens its module item, through the
 * one mapping the board uses too (lib/entityTarget).
 */
export function lineTarget(line: { id: string; source_type: string; source_id: string | null }): EntityTarget | null {
  if (line.source_type === 'manual') return { tool: 'calendar', itemId: line.id };
  return entityTarget(line.source_type, line.source_id);
}
