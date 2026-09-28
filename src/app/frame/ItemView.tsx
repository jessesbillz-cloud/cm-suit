// An opened item: in the right column (desktop), full screen (phone), or alone in its own window (?window=1).
import type { Tool } from '../../lib/layout';
import { BidsItem } from '../../features/bids/BidsItem';
import { BoardItem } from '../../features/board/BoardItem';
import { CalendarItem } from '../../features/calendar/CalendarItem';
import { DailiesItem } from '../../features/dailies/DailiesItem';
import { DeliveryItem } from '../../features/deliveries/DeliveryItem';
import { FileItem } from '../../features/files/FileItem';
import { InspectionsItem } from '../../features/inspections/InspectionsItem';
import { EmptyState } from '../../ui/States';
import type { FrameModel } from './useFrameModel';

interface ItemViewProps {
  model: FrameModel;
  tool: Tool;
  itemId: string;
  /** In its own window there is no "open in new window". */
  standalone: boolean;
}

export function ItemView({ model, tool, itemId, standalone }: ItemViewProps) {
  const openWindow = standalone
    ? undefined
    : () => {
        window.open(model.itemWindowHref(tool, itemId), '_blank', 'noopener');
      };

  if (tool === 'board') {
    return (
      <BoardItem
        key={itemId}
        activityId={itemId}
        boardProjectId={model.loc.projectId}
        onNavigate={(id) => {
          model.openItem('board', id);
        }}
        onOpenWindow={openWindow}
      />
    );
  }
  if (tool === 'files') return <FileItem key={itemId} fileId={itemId} onOpenWindow={openWindow} />;
  if (tool === 'bids' && model.loc.projectId !== null) return <BidsItem projectId={model.loc.projectId} itemId={itemId} />;
  if (tool === 'calendar') return <CalendarItem key={itemId} projectId={model.loc.projectId} itemId={itemId} />;
  if (tool === 'dailies' && model.loc.projectId !== null) return <DailiesItem projectId={model.loc.projectId} itemId={itemId} />;
  if (tool === 'inspections' && model.loc.projectId !== null) {
    return <InspectionsItem projectId={model.loc.projectId} itemId={itemId} onOpenWindow={openWindow} />;
  }
  if (tool === 'deliveries' && model.loc.projectId !== null) return <DeliveryItem projectId={model.loc.projectId} itemId={itemId} />;
  return <EmptyState title="There is nothing to open here." />;
}

/** The right column's title for an open item. */
export function itemTitle(tool: Tool): string {
  if (tool === 'files') return 'File';
  if (tool === 'board') return 'Board item';
  if (tool === 'bids') return 'Bids';
  if (tool === 'calendar') return 'Calendar';
  if (tool === 'dailies') return 'Dailies';
  if (tool === 'inspections') return 'Inspection';
  if (tool === 'deliveries') return 'Delivery';
  return 'Item';
}
