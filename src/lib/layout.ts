// The user_layout schema and its defaults (SPEC §5.1, §7.2). The ONE place layout defaults live.
// The only layout choices a person has: main default, docked panel, collapsed panes, calendar types, notification
// kinds, recent jobs and the "What's new" line, plus each job's tools on the rail (user_job_rail, 0051, chosen under
// the job's name). No dragging, no resizing. The old global pins (rail_items) are retired and never read.
import { z } from 'zod';

/** Every tool the frame can show in the main area. */
const TOOLS = [
  'board',
  'files',
  'bids',
  'calendar',
  'dailies',
  'inspections',
  'rfis',
  'deliveries',
  'corrections',
  'people',
  'settings',
  'hours',
  'timesheets',
] as const;
export type Tool = (typeof TOOLS)[number];

/** Tools a person may put on the rail. Settings is pinned at the bottom of the rail, not a choice. */
export const RAIL_TOOLS = [
  'board',
  'files',
  'bids',
  'calendar',
  'dailies',
  'inspections',
  'rfis',
  'deliveries',
  'corrections',
  'people',
  'hours',
  'timesheets',
] as const;
export type RailTool = (typeof RAIL_TOOLS)[number];

/** Panels that can sit docked in the right column. */
export const DOCKED_PANELS = ['board', 'none'] as const;
type DockedPanel = (typeof DOCKED_PANELS)[number];

export const CALENDAR_TYPES = [
  'inspections',
  'special_inspections',
  'deliveries',
  'meetings',
  'pours',
  'milestones',
  'lookahead',
  'my_due',
] as const;

interface NotifyEventDef {
  key: string;
  label: string;
  /** Who the event is for, when it is not everyone. */
  note?: string;
}

export interface NotifyAreaDef {
  key: string;
  label: string;
  events: readonly NotifyEventDef[];
}

/**
 * What a person can be notified about (SPEC §7.8): areas, each with its events. The ONE place these keys and labels
 * live. Event keys are stored in user_layout.notification_kinds, so a key never changes; rfi_answers, impact_claims,
 * ir_results, addenda and transmittals are the keys saved before the tree and keep their meaning.
 */
export const NOTIFY_AREAS = [
  {
    key: 'tasks',
    label: 'Tasks that involve me',
    events: [
      { key: 'task_assigned', label: 'Assigned to me' },
      { key: 'task_signature', label: 'Waiting on my signature' },
      { key: 'task_due_soon', label: 'Due soon' },
    ],
  },
  {
    key: 'rfis',
    label: 'RFIs',
    events: [
      { key: 'rfi_asked', label: 'An RFI is asked of me' },
      { key: 'rfi_answers', label: 'My RFI is answered' },
      { key: 'impact_claims', label: 'Impact claimed' },
    ],
  },
  {
    key: 'inspections',
    label: 'Inspections',
    events: [
      { key: 'ir_confirmed', label: 'My request confirmed' },
      { key: 'ir_moved', label: 'Moved or postponed' },
      { key: 'ir_results', label: 'Results in' },
    ],
  },
  {
    key: 'deliveries',
    label: 'Deliveries',
    events: [
      { key: 'delivery_posted', label: 'Posted on my job' },
      { key: 'delivery_standby', label: 'Standby' },
    ],
  },
  {
    key: 'corrections',
    label: 'Corrections',
    events: [
      { key: 'correction_ready', label: 'Marked ready', note: 'Inspectors' },
      { key: 'correction_status', label: 'Status changed on mine' },
    ],
  },
  {
    key: 'bids',
    label: 'Bids',
    events: [
      { key: 'addenda', label: 'Addendum issued' },
      { key: 'bid_question_answered', label: 'Question answered' },
      { key: 'bid_received', label: 'Bid received' },
    ],
  },
  {
    key: 'files',
    label: 'Files',
    events: [{ key: 'transmittals', label: 'Transmittal sent to me' }],
  },
] as const satisfies readonly NotifyAreaDef[];

export type NotifyArea = (typeof NOTIFY_AREAS)[number]['key'];
type NotifyKind = (typeof NOTIFY_AREAS)[number]['events'][number]['key'];

/** Every event key, in tree order. */
const NOTIFY_KINDS: readonly NotifyKind[] = NOTIFY_AREAS.flatMap((a) => a.events.map((e) => e.key));

/** Before the tree, 'tasks' meant every task event. */
const LEGACY_TASKS: readonly NotifyKind[] = ['task_assigned', 'task_signature', 'task_due_soon'];

/** Saved keys made current: the legacy 'tasks' expanded, unknown keys dropped, in tree order, no duplicates. */
function normalizeNotify(saved: readonly string[]): NotifyKind[] {
  const on = new Set<string>(saved.flatMap((k): readonly string[] => (k === 'tasks' ? LEGACY_TASKS : [k])));
  return NOTIFY_KINDS.filter((k) => on.has(k));
}

/** A parent box: all, some (indeterminate) or none of its events are on. */
export function areaState(area: NotifyAreaDef, on: readonly string[]): 'all' | 'some' | 'none' {
  const n = area.events.filter((e) => on.includes(e.key)).length;
  if (n === 0) return 'none';
  return n === area.events.length ? 'all' : 'some';
}

/** Turns events on or off (one child, or every child of a parent), keeping tree order. */
export function setNotify(on: readonly string[], keys: readonly string[], checked: boolean): NotifyKind[] {
  const set = new Set<string>(normalizeNotify(on));
  for (const k of keys) {
    if (checked) set.add(k);
    else set.delete(k);
  }
  return NOTIFY_KINDS.filter((k) => set.has(k));
}

/** How many recent jobs the picker remembers. */
const RECENT_LIMIT = 8;

export const LAYOUT_DEFAULTS = {
  main_default: 'board' as RailTool,
  docked_panel: 'board' as DockedPanel,
  collapsed: { rail: false, right: false },
  calendar_types: ['inspections', 'special_inspections', 'deliveries', 'meetings', 'milestones', 'lookahead'] as string[],
  // The quiet set (SPEC §7.8): my tasks, answers to my RFIs, impact claims, my IR results.
  notification_kinds: [...LEGACY_TASKS, 'rfi_answers', 'impact_claims', 'ir_results'] as NotifyKind[],
  recent_project_ids: [] as string[],
  whats_new_enabled: true,
};

/** Moves a tool one place up (-1) or down (+1) in a list (a job's tools on the rail). The phone bar shows the first ones. */
export function moveRailItem(items: readonly RailTool[], tool: RailTool, step: -1 | 1): RailTool[] {
  const from = items.indexOf(tool);
  const to = from + step;
  if (from < 0 || to < 0 || to >= items.length) return [...items];
  const next = items.filter((t) => t !== tool);
  next.splice(to, 0, tool);
  return next;
}

/** Unknown values in the row fall back to defaults rather than breaking the frame. Unknown keys (rail_items) drop. */
const layoutChoicesSchema = z.object({
  main_default: z.enum(RAIL_TOOLS).catch(LAYOUT_DEFAULTS.main_default),
  docked_panel: z.enum(DOCKED_PANELS).catch(LAYOUT_DEFAULTS.docked_panel),
  collapsed: z
    .object({ rail: z.boolean().catch(false), right: z.boolean().catch(false) })
    .catch(LAYOUT_DEFAULTS.collapsed),
  calendar_types: z.array(z.string()).catch(LAYOUT_DEFAULTS.calendar_types),
  notification_kinds: z.array(z.string()).transform(normalizeNotify).catch(LAYOUT_DEFAULTS.notification_kinds),
  recent_project_ids: z.array(z.string()).catch(LAYOUT_DEFAULTS.recent_project_ids),
  whats_new_enabled: z.boolean().catch(LAYOUT_DEFAULTS.whats_new_enabled),
});

export type LayoutChoices = z.infer<typeof layoutChoicesSchema>;

/** The saved row (or nothing) turned into a complete set of choices. */
export function parseLayout(row: unknown): LayoutChoices {
  if (row === null || typeof row !== 'object') return { ...LAYOUT_DEFAULTS };
  return layoutChoicesSchema.parse({ ...LAYOUT_DEFAULTS, ...row });
}

/** Most recent first, no duplicates, capped. */
export function pushRecent(recent: readonly string[], projectId: string): string[] {
  return [projectId, ...recent.filter((id) => id !== projectId)].slice(0, RECENT_LIMIT);
}

export function isTool(v: string): v is Tool {
  return (TOOLS as readonly string[]).includes(v);
}

/** Tools on the phone's bottom bar (SPEC §7.7). */
const PHONE_TABS = 4;

/**
 * The phone's bottom bar: the first rail tools, with the open tool always among them, then More for the rest of the
 * rail, the job's other tools (the desktop rail's More) and Settings, so every tool is one tap from More and the bar
 * never hides where you are.
 */
export function phoneTabs(rail: readonly Tool[], current: Tool, others: readonly Tool[] = []): { tabs: Tool[]; more: Tool[] } {
  const tabs = rail.slice(0, PHONE_TABS);
  const reachable = rail.includes(current) || others.includes(current);
  if (current !== 'settings' && reachable && !tabs.includes(current)) {
    if (tabs.length < PHONE_TABS) tabs.push(current);
    else tabs[PHONE_TABS - 1] = current;
  }
  const more: Tool[] = [...rail, ...others].filter((t) => !tabs.includes(t));
  return { tabs, more: [...more, 'settings'] };
}
