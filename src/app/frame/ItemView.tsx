// An opened item: in the right column (desktop), full screen (phone), or alone in its own window (?window=1). Its full
// view (expanded to full width, its own window, or the phone) has the item's comments under it; the preview does not.
// Item code loads on first use (lazyTools), with the usual loading line meanwhile.
import { Suspense } from 'react';
import type { Tool } from '../../lib/layout';
import {
  BILLING_ITEM,
  boardLineOf,
  CONTRACT_ITEM,
  DRAFT_ITEM_PREFIX,
  INVITE_ITEM,
  itemKindTitle,
  NEW_ITEM,
  NEW_TOPIC_ITEM,
  PROGRESS_ITEM,
  READ_ITEM,
  REV_FILE_PREFIX,
  ROOM_ITEM_PREFIX,
  SETUP_ITEM,
  SHARE_ITEM,
  TOPIC_ITEM_PREFIX,
  VERSION_ITEM_PREFIX,
  WALLS_ITEM,
} from '../../lib/itemIds';
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
  ScheduleItem,
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

/**
 * Panes that draw their own "Open in new window" (in their footer or head). Every other item gets it in the right
 * column's header (SPEC §7.2: every item has it); never on a phone, which has no windows.
 */
const OWN_WINDOW_BUTTON: readonly Tool[] = ['board', 'files', 'inspections', 'corrections', 'rfis', 'permits'];

/** The tool's item opens with its own "Open in new window" button, or the frame draws one. */
export function itemHasOwnWindowButton(tool: Tool, itemId: string): boolean {
  return boardLineOf(itemId) !== null || OWN_WINDOW_BUTTON.includes(tool);
}

function ToolItem({ model, tool, itemId, standalone, isPhone }: ToolItemProps) {
  // A phone has no windows, and an item alone in its window has nowhere further to go.
  const openWindow =
    standalone || isPhone
      ? undefined
      : () => {
          window.open(model.itemWindowHref(tool, itemId), '_blank', 'noopener');
        };

  // A board line, opened from the board or from the board docked beside this tool.
  const line = boardLineOf(itemId) ?? (tool === 'board' ? itemId : null);
  if (line !== null) {
    return (
      <BoardItem
        key={line}
        activityId={line}
        boardProjectId={model.loc.projectId}
        onNavigate={(id) => {
          if (tool === 'board') model.openItem('board', id);
          else model.openBoardLine(id);
        }}
        onOpenWindow={openWindow}
        // Beside the board (desktop, normal width) its "Needs you" already has these tasks: never twice on one screen.
        showTasks={standalone || isPhone || model.rightFull || tool !== 'board'}
      />
    );
  }
  const { projectId } = model.loc;
  if (tool === 'files') {
    // After a Delete the pane closes (in its own window there is nothing to go back to).
    return <FileItem key={itemId} fileId={itemId} onOpenWindow={openWindow} onClose={standalone ? undefined : model.closeItem} />;
  }
  if (tool === 'bids' && projectId !== null) return <BidsItem projectId={projectId} itemId={itemId} />;
  if (tool === 'calendar') return <CalendarItem key={itemId} projectId={projectId} itemId={itemId} />;
  if (tool === 'dailies' && projectId !== null) return <DailiesItem projectId={projectId} itemId={itemId} />;
  if (tool === 'inspections' && projectId !== null) {
    return <InspectionsItem projectId={projectId} itemId={itemId} onOpenWindow={openWindow} />;
  }
  if (tool === 'revs' && projectId !== null) return <RevsItem projectId={projectId} itemId={itemId} isPhone={isPhone} />;
  if (tool === 'deliveries' && projectId !== null) return <DeliveryItem projectId={projectId} itemId={itemId} />;
  if (tool === 'corrections' && projectId !== null) {
    return <CorrectionItem projectId={projectId} itemId={itemId} isPhone={isPhone} standalone={standalone} onOpenWindow={openWindow} />;
  }
  if (tool === 'rfis' && projectId !== null) {
    return <RfiItem projectId={projectId} itemId={itemId} isPhone={isPhone} onOpenWindow={openWindow} />;
  }
  if (tool === 'permits') {
    return <PermitItem projectId={projectId} itemId={itemId} isPhone={isPhone} wide={model.rightFull} onOpenWindow={openWindow} />;
  }
  if (tool === 'safety' && projectId !== null) return <SafetyItem projectId={projectId} itemId={itemId} isPhone={isPhone} />;
  if (tool === 'schedule' && projectId !== null) return <ScheduleItem projectId={projectId} itemId={itemId} isPhone={isPhone} />;
  if (tool === 'requirements' && projectId !== null) return <RequirementsItem projectId={projectId} itemId={itemId} />;
  if (tool === 'hours' && projectId !== null) return <HoursItem projectId={projectId} itemId={itemId} />;
  if (tool === 'timesheets') return <TimesheetsItem itemId={itemId} />;
  return <EmptyState title="There is nothing to open here." />;
}

export function ItemView({ model, tool, itemId, standalone }: ItemViewProps) {
  const isPhone = useIsPhone();
  const projectId = model.loc.projectId;
  const full = standalone || isPhone || model.rightFull;
  const target = full && projectId !== null && boardLineOf(itemId) === null ? commentTarget(tool, itemId) : null;
  // One wrapper either way, so going full width never remounts the item. With comments the item takes its own height
  // and the whole view scrolls; without, it fills the column as before. At full width (and alone in its window) the item
  // sits in one centered, readable column, its header and footer with it.
  const centered = full && !isPhone;
  return (
    <div data-testid="item-view" className={`${target === null ? 'h-full' : ''} ${centered ? 'mx-auto w-full max-w-reading' : ''}`}>
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

/** A bids item's kind, from the sub-view it opened in (the add forms are `new-<kind>` and `invite`). */
const BIDS_KINDS: Readonly<Record<string, string>> = {
  coverage: 'Package',
  packages: 'Package',
  subs: 'Sub',
  received: 'Bid',
  leveling: 'Bid',
  questions: 'Question',
  addenda: 'Addendum',
  forms: 'Form',
};

function bidsTitle(itemId: string, view: string | undefined): string {
  if (itemId === INVITE_ITEM) return 'Invite bidders';
  const kind = BIDS_KINDS[view ?? 'coverage'] ?? 'Bids';
  return itemId.startsWith('new-') ? `New ${kind.toLowerCase()}` : kind;
}

/** The right column's title for an open item: what the item is (never just the tool's name). `view`: the tool's sub-view. */
export function itemTitle(tool: Tool, itemId: string, view?: string): string {
  if (tool === 'board' || boardLineOf(itemId) !== null) return 'From the board';
  if (tool === 'files') return 'File';
  if (tool === 'bids') return bidsTitle(itemId, view);
  const kind = itemKindTitle(tool, itemId);
  if (kind !== null) return kind;
  if (tool === 'dailies') return itemId === SETUP_ITEM ? 'Setup' : 'Daily report';
  if (tool === 'inspections') return itemId === SHARE_ITEM ? 'Share' : 'Inspection';
  if (tool === 'revs') {
    if (itemId.startsWith(REV_FILE_PREFIX)) return 'File';
    if (itemId.startsWith(ROOM_ITEM_PREFIX)) return 'Room';
    return itemId === NEW_ITEM ? 'New list' : itemId === WALLS_ITEM ? 'Add walls' : 'Wall';
  }
  if (tool === 'corrections') return itemId === NEW_ITEM ? 'New correction' : itemId === PROGRESS_ITEM ? 'Progress' : 'Correction';
  if (tool === 'rfis') return 'RFI';
  if (tool === 'permits') return 'Permit';
  if (tool === 'safety') return itemId === NEW_TOPIC_ITEM || itemId.startsWith(TOPIC_ITEM_PREFIX) ? 'Topic' : 'Meeting';
  if (tool === 'schedule') return itemId.startsWith(DRAFT_ITEM_PREFIX) ? 'Draft' : itemId.startsWith(VERSION_ITEM_PREFIX) ? 'Update' : 'Activity';
  if (tool === 'requirements') return itemId === READ_ITEM ? 'Read spec' : itemId === NEW_ITEM ? 'New requirement' : 'Requirement';
  if (tool === 'hours') return itemId === CONTRACT_ITEM ? 'Contract hours' : 'Hours';
  if (tool === 'timesheets') return itemId === BILLING_ITEM ? 'Billing' : 'Invoice';
  return 'Item';
}
