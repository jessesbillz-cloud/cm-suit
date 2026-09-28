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
};

/** Where a record opens, or null when nothing owns that type (or the id is missing). */
export function entityTarget(type: string | null, id: string | null): EntityTarget | null {
  const home = type === null ? undefined : HOMES[type];
  if (!home) return null;
  const view = home.view === undefined ? {} : { view: home.view };
  if (home.toolOnly) return { tool: home.tool, itemId: null, ...view };
  return id ? { tool: home.tool, itemId: id, ...view } : null;
}
