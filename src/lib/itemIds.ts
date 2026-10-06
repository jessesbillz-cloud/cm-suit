// Right-column items that are forms or pages, not records (records are uuids). One place, so the frame can title
// them and keep comments off them without loading any tool's code; each tool's model re-exports the ones it uses.
/** A new record's form (RFIs, inspections, deliveries, corrections). */
export const NEW_ITEM = 'new';
/** Inspections: blocking out days. */
export const BLOCK_ITEM = 'block';
/** Inspections: the job's request link and QR sheet. */
export const SHARE_ITEM = 'share';
/** Dailies: the setup screen. */
export const SETUP_ITEM = 'setup';
/** Corrections: the weekly progress snapshot. */
export const PROGRESS_ITEM = 'progress';
/** Hours: the contract hours form. */
export const CONTRACT_ITEM = 'contract';
/** Hours: a week (`week-<its Monday>`) or a month (`month-<yyyy-MM>`) opens as the list of its days. */
export const HOURS_WEEK_PREFIX = 'week-';
export const HOURS_MONTH_PREFIX = 'month-';
/** Timesheets: the billing form. */
export const BILLING_ITEM = 'billing';
/** Revs: adding walls to a list. */
export const WALLS_ITEM = 'walls';
/** Revs (0083): a room opens as `room-<id>` (a page of its own), a wall's file beside it as `file-<id>`. */
export const ROOM_ITEM_PREFIX = 'room-';
export const REV_FILE_PREFIX = 'file-';
/** Safety: a new topic for the company's library. */
export const NEW_TOPIC_ITEM = 'new-topic';
/** Safety: a library topic opens as `topic-<id>` (a meeting opens by its own id). */
export const TOPIC_ITEM_PREFIX = 'topic-';
/** Schedule: a draft's review opens as `draft-<id>` (a page of its own), a published version as `v-<id>` (an activity by its own id). */
export const DRAFT_ITEM_PREFIX = 'draft-';
export const VERSION_ITEM_PREFIX = 'v-';
/** Calendar: my calendar feed link (the calendar's model re-exports it). */
export const SUBSCRIBE_ITEM = 'subscribe';
/** Bids: inviting bidders (the bids model re-exports it). */
export const INVITE_ITEM = 'invite';
/** Requirements: read a spec section with AI. */
export const READ_ITEM = 'read';
/** Calendar: an inspection request opens as `ir.<job>.<request>` (its job travels with it on All my jobs). */
export const REQUEST_ITEM_PREFIX = 'ir.';

/**
 * The right column's title for the items whose kind the id already says (Oct 4 audit: "titles say the item's kind"):
 * the calendar's add form, blocked time, feed link, an inspection request or a line; the deliveries' post form or a
 * delivery. Null for other tools (the frame keeps its own titles for those).
 */
export function itemKindTitle(tool: string, itemId: string): string | null {
  if (tool === 'calendar') {
    if (itemId === NEW_ITEM) return 'New line';
    if (itemId === BLOCK_ITEM) return 'Block time';
    if (itemId === SUBSCRIBE_ITEM) return 'Subscribe';
    return itemId.startsWith(REQUEST_ITEM_PREFIX) ? 'Inspection' : 'Calendar line';
  }
  if (tool === 'deliveries') return itemId === NEW_ITEM ? 'Post delivery' : 'Delivery';
  return null;
}

/**
 * A board line opened from the docked board beside another tool: `board.<activity id>`, an item of the tool I'm in, so
 * the main area stays put and Close brings the docked board back (SPEC §7.2). A dot never starts a record's id.
 */
const BOARD_LINE_PREFIX = 'board.';

export function boardLineItem(activityId: string): string {
  return `${BOARD_LINE_PREFIX}${activityId}`;
}

/** The activity id of a docked board line, or null when the item is the tool's own. */
export function boardLineOf(itemId: string | null): string | null {
  return itemId !== null && itemId.startsWith(BOARD_LINE_PREFIX) ? itemId.slice(BOARD_LINE_PREFIX.length) : null;
}

/**
 * Items that are pages of their own: on a desktop they fill the main area instead of the right column (the right column
 * keeps its docked panel). A Revs wall is one (Jesse, Oct 3: "the whole wall gets built out on its own inspection page"), and a
 * schedule draft's review (its rows want the width).
 */
export function opensInMain(tool: string, itemId: string): boolean {
  if (boardLineOf(itemId) !== null) return false;
  if (tool === 'schedule') return itemId.startsWith(DRAFT_ITEM_PREFIX);
  return tool === 'revs' && itemId !== NEW_ITEM && itemId !== WALLS_ITEM;
}

/** The tools whose records open beside a page in the main area (a Revs wall: its requests and its OFS IRs). */
const SIDE_TOOLS = ['inspections', 'revs'] as const;
const SIDE = /^(inspections|revs):([0-9a-z-]{1,80})$/;

/**
 * A record in the right column beside a page in the main area (?side=<tool>:<item>), so the page stays put (Jesse,
 * Oct 5: "click on it and expand it over there on the right hand side"). Null when the value isn't one.
 */
export function sideItem(side: string | undefined): { tool: (typeof SIDE_TOOLS)[number]; itemId: string } | null {
  const m = side === undefined ? null : SIDE.exec(side);
  const tool = SIDE_TOOLS.find((t) => t === m?.[1]);
  return tool && m?.[2] ? { tool, itemId: m[2] } : null;
}
