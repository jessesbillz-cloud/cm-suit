// Which opened item takes comments, and as which record (lib/entityTarget, the one type <-> tool mapping). Items in the
// right column that are forms or pages, not records (a new RFI, the inspections share page, the dailies setup...), take none.
import { commentEntity, type CommentEntity } from '../../lib/entityTarget';
import type { Tool } from '../../lib/layout';
import { NEW_ITEM as NEW_CORRECTION, PROGRESS_ITEM } from '../../features/corrections/model';
import { SETUP_ITEM } from '../../features/dailies/model';
import { NEW_ITEM as NEW_DELIVERY } from '../../features/deliveries/useDeliveriesNav';
import { BLOCK_ITEM, NEW_ITEM as NEW_REQUEST, SHARE_ITEM } from '../../features/inspections/model';
import { NEW_ITEM as NEW_RFI } from '../../features/rfis/model';

const NOT_RECORDS: Partial<Record<Tool, readonly string[]>> = {
  rfis: [NEW_RFI],
  inspections: [NEW_REQUEST, BLOCK_ITEM, SHARE_ITEM],
  dailies: [SETUP_ITEM],
  deliveries: [NEW_DELIVERY],
  corrections: [NEW_CORRECTION, PROGRESS_ITEM],
};

/** The record an opened item is, for its comments; null when the item takes none. */
export function commentTarget(tool: Tool, itemId: string): { entityType: CommentEntity; entityId: string } | null {
  const entityType = commentEntity(tool);
  if (entityType === null || itemId === '' || NOT_RECORDS[tool]?.includes(itemId) === true) return null;
  return { entityType, entityId: itemId };
}
