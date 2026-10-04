// Where a record lives: ONE mapping from a record's type (a board line's entity_type, a mirrored calendar line's
// source_type) to the tool that owns it and the item to open there. The calendar and the board both use it.
import type { Tool } from './layout';

export interface EntityTarget {
  tool: Tool;
  /** null: open the tool, not an item. */
  itemId: string | null;
  /** The tool's sub-view the item lives in (Bids ?view=). Absent for tools with one view. */
  view?: string;
}

interface Home {
  tool: Tool;
  view?: string;
  /** The line opens the tool, not an item in it (the id is not that tool's row). */
  toolOnly?: true;
}

const HOMES: Record<string, Home> = {
  file: { tool: 'files' },
  delivery: { tool: 'deliveries' },
  inspection_request: { tool: 'inspections' },
  correction: { tool: 'corrections' },
  rfi: { tool: 'rfis' },
  permit: { tool: 'permits' },
  daily_report: { tool: 'dailies' },
  addendum: { tool: 'bids', view: 'addenda' },
  bid_question: { tool: 'bids', view: 'questions' },
  bid_submission: { tool: 'bids', view: 'received' },
  // An answer is its own row; the questions view is where it lives.
  published_answer: { tool: 'bids', view: 'questions', toolOnly: true },
  bid_invite: { tool: 'bids', view: 'coverage', toolOnly: true },
  // A required bid form (a due day on the calendar opens it).
  bid_form_item: { tool: 'bids', view: 'forms' },
  // The job's bid time is the job, not a row.
  project_bid_due: { tool: 'bids', toolOnly: true },
  project_member: { tool: 'people', toolOnly: true },
  // Safety (0060): a meeting (the calendar's line, the board's close line); the tailgate reminder opens the tool.
  safety_meeting: { tool: 'safety' },
  safety_due: { tool: 'safety', toolOnly: true },
  // Schedule (0062): an activity (the calendar's look-ahead and milestone lines); a published update and the "update due"
  // line open the tool.
  schedule_activity: { tool: 'schedule' },
  schedule_version: { tool: 'schedule', view: 'updates', toolOnly: true },
  schedule_due: { tool: 'schedule', view: 'updates', toolOnly: true },
  // Requirements (0069): a line of the register (the reminder's board line and task open it).
  requirement: { tool: 'requirements' },
};

/** Where a record opens, or null when nothing owns that type (or the id is missing). */
export function entityTarget(type: string | null, id: string | null): EntityTarget | null {
  const home = type === null ? undefined : HOMES[type];
  if (!home) return null;
  const view = home.view === undefined ? {} : { view: home.view };
  if (home.toolOnly) return { tool: home.tool, itemId: null, ...view };
  return id ? { tool: home.tool, itemId: id, ...view } : null;
}

/** The tool that owns a record type (a task's entity_type), or null when none does. */
export function entityTool(type: string | null): Tool | null {
  return type === null ? null : (HOMES[type]?.tool ?? null);
}

/** Records people comment on (comments.entity_type, migration 0050). */
const COMMENT_ENTITIES = ['rfi', 'inspection_request', 'file', 'daily_report', 'correction', 'delivery'] as const;
export type CommentEntity = (typeof COMMENT_ENTITIES)[number];

/** The record type a tool's items are when they take comments (its one record type at home there), else null. */
export function commentEntity(tool: Tool): CommentEntity | null {
  return (
    COMMENT_ENTITIES.find((type) => {
      const home = HOMES[type];
      return home !== undefined && home.tool === tool && home.toolOnly !== true;
    }) ?? null
  );
}
