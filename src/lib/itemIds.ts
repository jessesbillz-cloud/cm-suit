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
/** Timesheets: the billing form. */
export const BILLING_ITEM = 'billing';
/** Revs: adding walls to a list. */
export const WALLS_ITEM = 'walls';
/** Safety: a new topic for the company's library. */
export const NEW_TOPIC_ITEM = 'new-topic';
/** Safety: a library topic opens as `topic-<id>` (a meeting opens by its own id). */
export const TOPIC_ITEM_PREFIX = 'topic-';
/** Schedule: a draft's review opens as `draft-<id>` (a page of its own), a published version as `v-<id>` (an activity by its own id). */
export const DRAFT_ITEM_PREFIX = 'draft-';
export const VERSION_ITEM_PREFIX = 'v-';
/** Requirements: read a spec section with AI. */
export const READ_ITEM = 'read';

/**
 * Items that are pages of their own: on a desktop they fill the main area instead of the right column (the right column
 * keeps its docked panel). A Revs wall is one (Jesse, Oct 3: "the whole wall gets built out on its own inspection page"), and a
 * schedule draft's review (its rows want the width).
 */
export function opensInMain(tool: string, itemId: string): boolean {
  if (tool === 'schedule') return itemId.startsWith(DRAFT_ITEM_PREFIX);
  return tool === 'revs' && itemId !== NEW_ITEM && itemId !== WALLS_ITEM;
}
