// Which opened item takes comments, and as which record (lib/entityTarget, the one type <-> tool mapping). Items in the
// right column that are forms or pages, not records (a new RFI, the inspections share page, the dailies setup...), take none.
import { commentEntity, type CommentEntity } from '../../lib/entityTarget';
import type { Tool } from '../../lib/layout';
import { BLOCK_ITEM, NEW_ITEM, PROGRESS_ITEM, SETUP_ITEM, SHARE_ITEM } from '../../lib/itemIds';

const NOT_RECORDS: Partial<Record<Tool, readonly string[]>> = {
  rfis: [NEW_ITEM],
  inspections: [NEW_ITEM, BLOCK_ITEM, SHARE_ITEM],
  dailies: [SETUP_ITEM],
  deliveries: [NEW_ITEM],
  corrections: [NEW_ITEM, PROGRESS_ITEM],
};

/** The record an opened item is, for its comments; null when the item takes none. */
export function commentTarget(tool: Tool, itemId: string): { entityType: CommentEntity; entityId: string } | null {
  const entityType = commentEntity(tool);
  if (entityType === null || itemId === '' || NOT_RECORDS[tool]?.includes(itemId) === true) return null;
  return { entityType, entityId: itemId };
}
