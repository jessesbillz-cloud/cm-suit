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
