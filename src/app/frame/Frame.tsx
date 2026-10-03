// The desktop frame (SPEC §7.2): the rail down the left, then the top bar (job picker) over main area / right column. Bounded: nothing drags
// or resizes; each pane collapses. Layout choices are read from and saved to user_layout.
import { Suspense } from 'react';
import { opensInMain } from '../../lib/itemIds';
import { JobPicker } from '../../ui/JobPicker';
import { Rail } from '../../ui/Rail';
import { RightColumn } from '../../ui/RightColumn';
import { LoadingState } from '../../ui/States';
import { ViewAs } from '../../ui/ViewAs';
import { ItemView, itemTitle } from './ItemView';
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
          model.openItem('board', line.id);
        }}
      />
    </Suspense>
  );
}

export function Frame({ model, folderId }: FrameProps) {
  const { loc, choices } = model;
  if (!choices) return null;

  // An item that is a page of its own (a Revs wall) fills the main area; the right column keeps its docked panel.
  const itemInMain = loc.itemId !== null && opensInMain(loc.tool, loc.itemId);
  const itemOpen = loc.itemId !== null && !itemInMain;
  const showRight = itemOpen || choices.docked_panel !== 'none';
  const rightCollapsed = !itemOpen && choices.collapsed.right;
  const rightFull = showRight && !rightCollapsed && model.rightFull && !itemInMain;

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
          <div className="ml-auto">
            <ViewAs />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          {rightFull ? null : (
            <main data-testid="main-area" data-tool={loc.tool} className="min-w-0 flex-1 overflow-auto p-4">
              <ToolView model={model} tool={loc.tool} folderId={folderId} isPhone={false} />
            </main>
          )}
          {showRight ? (
            <RightColumn
              title={itemOpen && loc.itemId !== null ? itemTitle(loc.tool, loc.itemId) : loc.tool === 'board' ? 'Today' : 'Board'}
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
              onCloseItem={itemOpen ? model.closeItem : undefined}
            >
              {itemOpen && loc.itemId !== null ? (
                <ItemView model={model} tool={loc.tool} itemId={loc.itemId} standalone={false} />
              ) : (
                <Docked model={model} />
              )}
            </RightColumn>
          ) : null}
        </div>
      </div>
    </div>
  );
}
