// The user_layout schema and its defaults (SPEC §5.1, §7.2). The ONE place layout defaults live.
// The only layout choices a person has: rail icons, main default, docked panel, collapsed panes, calendar types,
// notification kinds, recent jobs and the "What's new" line. No dragging, no resizing.
import { z } from 'zod';

/** Every tool the frame can show in the main area. */
const TOOLS = ['board', 'files', 'bids', 'calendar', 'people', 'settings'] as const;
export type Tool = (typeof TOOLS)[number];

/** Tools a person may put on the rail. Settings is pinned at the bottom of the rail, not a choice. */
export const RAIL_TOOLS = ['board', 'files', 'bids', 'calendar', 'people'] as const;
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

export const NOTIFICATION_KINDS = ['tasks', 'rfi_answers', 'impact_claims', 'ir_results', 'addenda', 'transmittals'] as const;

/** How many recent jobs the picker remembers. */
const RECENT_LIMIT = 8;

export const LAYOUT_DEFAULTS = {
  rail_items: ['board', 'files', 'bids', 'calendar', 'people'] as RailTool[],
  main_default: 'board' as RailTool,
  docked_panel: 'board' as DockedPanel,
  collapsed: { rail: false, right: false },
  calendar_types: ['inspections', 'deliveries', 'meetings', 'milestones'] as string[],
  notification_kinds: ['tasks', 'rfi_answers', 'impact_claims', 'ir_results'] as string[],
  recent_project_ids: [] as string[],
  whats_new_enabled: true,
};

function isRailTool(v: string): v is RailTool {
  return (RAIL_TOOLS as readonly string[]).includes(v);
}

/** Unknown values in the row fall back to defaults rather than breaking the frame. */
const layoutChoicesSchema = z.object({
  rail_items: z
    .array(z.string())
    .transform((a) => a.filter(isRailTool))
    .catch(LAYOUT_DEFAULTS.rail_items),
  main_default: z.enum(RAIL_TOOLS).catch(LAYOUT_DEFAULTS.main_default),
  docked_panel: z.enum(DOCKED_PANELS).catch(LAYOUT_DEFAULTS.docked_panel),
  collapsed: z
    .object({ rail: z.boolean().catch(false), right: z.boolean().catch(false) })
    .catch(LAYOUT_DEFAULTS.collapsed),
  calendar_types: z.array(z.string()).catch(LAYOUT_DEFAULTS.calendar_types),
  notification_kinds: z.array(z.string()).catch(LAYOUT_DEFAULTS.notification_kinds),
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
