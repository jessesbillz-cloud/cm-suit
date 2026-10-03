// An opened item: in the right column (desktop), full screen (phone), or alone in its own window (?window=1). Its full
// view (expanded to full width, its own window, or the phone) has the item's comments under it; the preview does not.
// Item code loads on first use (lazyTools), with the usual loading line meanwhile.
import { Suspense } from 'react';
import type { Tool } from '../../lib/layout';
import { BILLING_ITEM, CONTRACT_ITEM, NEW_ITEM, NEW_TOPIC_ITEM, READ_ITEM, SHARE_ITEM, TOPIC_ITEM_PREFIX, WALLS_ITEM } from '../../lib/itemIds';
import { EmptyState, LoadingState } from '../../ui/States';
import { commentTarget } from './commentTarget';
import {
  BidsItem,
  BoardItem,
  CalendarItem,
  CommentsPanel,
  CorrectionItem,
  DailiesItem,
  DeliveryItem,
  FileItem,
  HoursItem,
  InspectionsItem,
  PermitItem,
  RequirementsItem,
  RevsItem,
  RfiItem,
  SafetyItem,
  TimesheetsItem,
} from './lazyTools';
import type { FrameModel } from './useFrameModel';
import { useIsPhone } from './useIsPhone';

interface ItemViewProps {
  model: FrameModel;
  tool: Tool;
  itemId: string;
  /** In its own window there is no "open in new window". */
  standalone: boolean;
}

interface ToolItemProps extends ItemViewProps {
  isPhone: boolean;
}

function ToolItem({ model, tool, itemId, standalone, isPhone }: ToolItemProps) {
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
        // A phone has no windows; the footer keeps its room for Open and Download.
        onOpenWindow={isPhone ? undefined : openWindow}
        // Beside the board (desktop, normal width) its "Needs you" already has these tasks: never twice on one screen.
        showTasks={standalone || isPhone || model.rightFull}
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
  if (tool === 'revs' && model.loc.projectId !== null) return <RevsItem projectId={model.loc.projectId} itemId={itemId} isPhone={isPhone} />;
  if (tool === 'deliveries' && model.loc.projectId !== null) return <DeliveryItem projectId={model.loc.projectId} itemId={itemId} />;
  if (tool === 'corrections' && model.loc.projectId !== null) {
    return (
      <CorrectionItem projectId={model.loc.projectId} itemId={itemId} isPhone={isPhone} standalone={standalone} onOpenWindow={openWindow} />
    );
  }
  if (tool === 'rfis' && model.loc.projectId !== null) {
    return <RfiItem projectId={model.loc.projectId} itemId={itemId} isPhone={isPhone} onOpenWindow={isPhone ? undefined : openWindow} />;
  }
  if (tool === 'permits') {
    return <PermitItem projectId={model.loc.projectId} itemId={itemId} isPhone={isPhone} onOpenWindow={isPhone ? undefined : openWindow} />;
  }
  if (tool === 'safety' && model.loc.projectId !== null) return <SafetyItem projectId={model.loc.projectId} itemId={itemId} isPhone={isPhone} />;
  if (tool === 'requirements' && model.loc.projectId !== null) return <RequirementsItem projectId={model.loc.projectId} itemId={itemId} />;
  if (tool === 'hours' && model.loc.projectId !== null) return <HoursItem projectId={model.loc.projectId} itemId={itemId} />;
  if (tool === 'timesheets') return <TimesheetsItem itemId={itemId} />;
  return <EmptyState title="There is nothing to open here." />;
}

export function ItemView({ model, tool, itemId, standalone }: ItemViewProps) {
  const isPhone = useIsPhone();
  const projectId = model.loc.projectId;
  const full = standalone || isPhone || model.rightFull;
  const target = full && projectId !== null ? commentTarget(tool, itemId) : null;
  // One wrapper either way, so going full width never remounts the item. With comments the item takes its own height
  // and the whole view scrolls; without, it fills the column as before.
  return (
    <div className={target === null ? 'h-full' : undefined}>
      <Suspense fallback={<LoadingState />}>
        <ToolItem model={model} tool={tool} itemId={itemId} standalone={standalone} isPhone={isPhone} />
      </Suspense>
      {target !== null && projectId !== null ? (
        <Suspense fallback={<LoadingState label="Loading comments" />}>
          <CommentsPanel key={`${target.entityType}:${target.entityId}`} target={{ projectId, ...target }} />
        </Suspense>
      ) : null}
    </div>
  );
}

/** The right column's title for an open item. */
export function itemTitle(tool: Tool, itemId: string): string {
  if (tool === 'files') return 'File';
  if (tool === 'board') return 'From the board';
  if (tool === 'bids') return 'Bids';
  if (tool === 'calendar') return 'Calendar';
  if (tool === 'dailies') return 'Dailies';
  if (tool === 'inspections') return itemId === SHARE_ITEM ? 'Share' : 'Inspection';
  if (tool === 'revs') return itemId === NEW_ITEM ? 'New list' : itemId === WALLS_ITEM ? 'Add walls' : 'Wall';
  if (tool === 'deliveries') return 'Delivery';
  if (tool === 'corrections') return 'Corrections';
  if (tool === 'rfis') return 'RFI';
  if (tool === 'permits') return 'Permit';
  if (tool === 'safety') return itemId === NEW_TOPIC_ITEM || itemId.startsWith(TOPIC_ITEM_PREFIX) ? 'Topic' : 'Meeting';
  if (tool === 'requirements') return itemId === READ_ITEM ? 'Read spec' : itemId === NEW_ITEM ? 'New requirement' : 'Requirement';
  if (tool === 'hours') return itemId === CONTRACT_ITEM ? 'Contract hours' : 'Hours';
  if (tool === 'timesheets') return itemId === BILLING_ITEM ? 'Billing' : 'Invoice';
  return 'Item';
}
