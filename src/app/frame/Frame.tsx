// The desktop frame (SPEC §7.2): the rail down the left, then the top bar (job picker) over main area / right column. Bounded: nothing drags
// or resizes; each pane collapses. Layout choices are read from and saved to user_layout.
import { Suspense } from 'react';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { opensInMain, sideItem } from '../../lib/itemIds';
import { Button } from '../../ui/Button';
import { JobPicker } from '../../ui/JobPicker';
import { Rail } from '../../ui/Rail';
import { RightColumn } from '../../ui/RightColumn';
import { LoadingState } from '../../ui/States';
import { ViewAs } from '../../ui/ViewAs';
import { ItemView, itemHasOwnWindowButton, itemTitle } from './ItemView';
import { DockedBoard, preloadTool, TodayPanel } from './lazyTools';
import { ToolView } from './ToolView';
import type { FrameModel } from './useFrameModel';

interface FrameProps {
  model: FrameModel;
  folderId: string | null;
}

interface DockedProps {
  model: FrameModel;
}

/** The docked panel: the board beside every other tool; beside the board itself, what's on today (never the board twice). */
function Docked({ model }: DockedProps) {
  if (model.loc.tool === 'board') {
    return (
      <Suspense fallback={<LoadingState label="Loading today" />}>
        <TodayPanel projectId={model.loc.projectId} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<LoadingState label="Loading the board" />}>
      <DockedBoard
        projectId={model.loc.projectId}
        onOpen={(line) => {
          // The line opens in this column; the tool in the main area stays (Close brings the board back).
          model.openBoardLine(line.id);
        }}
      />
    </Suspense>
  );
}

/** The search without `side`: the page in the main area as it was, the record beside it closed. */
function withoutSide(search: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(search).filter((e): e is [string, string] => e[0] !== 'side' && typeof e[1] === 'string'));
}

export function Frame({ model, folderId }: FrameProps) {
  const { loc, choices } = model;
  const navigate = useNavigate();
  const router = useRouter();
  // The tool's sub-view (Bids ?view=) names what an opened item is, and a record may sit beside a page (?side=); ?back=board
  // when a board line's "Open in ..." brought me here.
  const search: { view?: string | undefined; side?: string | undefined; back?: string | undefined } = useSearch({ strict: false });
  if (!choices) return null;

  // An item that is a page of its own (a Revs wall) fills the main area; the right column keeps its docked panel, or
  // shows a record opened from the page beside it (?side=: a wall's request), Close bringing the panel back.
  const itemInMain = loc.itemId !== null && opensInMain(loc.tool, loc.itemId);
  const side = itemInMain ? sideItem(search.side) : null;
  const itemOpen = loc.itemId !== null && !itemInMain;
  const right = itemOpen && loc.itemId !== null ? { tool: loc.tool, itemId: loc.itemId } : side;
  const showRight = right !== null || choices.docked_panel !== 'none';
  const rightCollapsed = right === null && choices.collapsed.right;
  const rightFull = showRight && !rightCollapsed && model.rightFull && (!itemInMain || side !== null);
  const closeSide =
    side !== null && loc.projectId !== null && loc.itemId !== null
      ? () => {
          model.setRightFull(false);
          void navigate({
            to: '/p/$projectId/$tool/$itemId',
            params: { projectId: loc.projectId ?? '', tool: loc.tool, itemId: loc.itemId ?? '' },
            search: withoutSide(search),
          });
        }
      : undefined;
  // Every item has Open in new window (SPEC §7.2): in its own pane where it has one, else in the column's header.
  const openWindow =
    right !== null && !itemHasOwnWindowButton(right.tool, right.itemId)
      ? () => {
          window.open(model.itemWindowHref(right.tool, right.itemId), '_blank', 'noopener');
        }
      : undefined;

  return (
    <div className="flex h-screen bg-page">
      <Rail
        general={model.rail.general}
        job={model.jobPart}
        counts={model.counts}
        current={loc.tool}
        collapsed={choices.collapsed.rail}
        onSelect={model.selectTool}
        onPreload={(tool) => {
          preloadTool(tool, loc.projectId !== null);
        }}
        onToggleCollapsed={() => {
          model.save({
            collapsed: { ...choices.collapsed, rail: !choices.collapsed.rail },
          });
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line bg-card px-3">
          <JobPicker
            projects={model.projects}
            recentIds={choices.recent_project_ids}
            currentId={loc.projectId}
            onPick={model.pickJob}
            onNewJob={model.newJob}
          />
          {search.back === 'board' ? (
            <Button
              size="sm"
              icon={ArrowLeft}
              className="font-semibold"
              data-testid="frame-back"
              onClick={() => {
                router.history.back();
              }}
            >
              Back
            </Button>
          ) : null}
          <div className="ml-auto">
            <ViewAs />
          </div>
        </header>
        {/* The main area and the right column are one pair, centered as a whole on a very wide screen. Every tool
            gets the same width (max-w-tool), so the left edge never jumps between tools. */}
        <div className="flex min-h-0 flex-1 justify-center">
          <div data-testid="frame-pair" className={`flex min-h-0 w-full ${rightFull ? '' : 'max-w-frame'}`}>
          {/* At full screen the main area only hides: Back finds it exactly as it was, scrolled where it was. */}
          <main
            data-testid="main-area"
            data-tool={loc.tool}
            hidden={rightFull}
            className={`min-w-0 flex-1 overflow-auto p-4 [scrollbar-gutter:stable] ${rightFull ? 'hidden' : ''}`}
          >
            <div data-testid="tool-width" className="mx-auto w-full max-w-tool">
              <ToolView model={model} tool={loc.tool} folderId={folderId} isPhone={false} />
            </div>
          </main>
          {showRight ? (
            <RightColumn
              title={right !== null ? itemTitle(right.tool, right.itemId, search.view) : loc.tool === 'board' ? 'Today' : 'Board'}
              collapsed={rightCollapsed}
              full={rightFull}
              onToggleCollapsed={() => {
                model.save({
                  collapsed: {
                    ...choices.collapsed,
                    right: !choices.collapsed.right,
                  },
                });
              }}
              onToggleFull={() => {
                model.setRightFull(!model.rightFull);
              }}
              onCloseItem={itemOpen ? model.closeItem : closeSide}
              onOpenWindow={openWindow}
            >
              {right !== null ? (
                <ItemView model={model} tool={right.tool} itemId={right.itemId} standalone={false} />
              ) : (
                <Docked model={model} />
              )}
            </RightColumn>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
