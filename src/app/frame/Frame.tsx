// The desktop frame (SPEC §7.2): job picker top-left, then rail / main area / right column. Bounded: nothing drags
// or resizes; each pane collapses. Layout choices are read from and saved to user_layout.
import { DockedBoard } from '../../features/board/DockedBoard';
import { JobPicker } from '../../ui/JobPicker';
import { Rail } from '../../ui/Rail';
import { RightColumn } from '../../ui/RightColumn';
import { EmptyState } from '../../ui/States';
import { ItemView, itemTitle } from './ItemView';
import { ToolView } from './ToolView';
import type { FrameModel } from './useFrameModel';

interface FrameProps {
  model: FrameModel;
  folderId: string | null;
}

interface DockedProps {
  model: FrameModel;
}

function Docked({ model }: DockedProps) {
  if (model.loc.tool === 'board') return <EmptyState title="Pick a line to read it here." />;
  return (
    <DockedBoard
      projectId={model.loc.projectId}
      onOpen={(line) => {
        model.openItem('board', line.id);
      }}
    />
  );
}

export function Frame({ model, folderId }: FrameProps) {
  const { loc, choices } = model;
  if (!choices) return null;

  const itemOpen = loc.itemId !== null;
  const showRight = itemOpen || choices.docked_panel !== 'none';
  const rightCollapsed = !itemOpen && choices.collapsed.right;
  const rightFull = showRight && !rightCollapsed && model.rightFull;

  return (
    <div className="flex h-screen flex-col bg-page">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-card px-2">
        <JobPicker
          projects={model.projects}
          recentIds={choices.recent_project_ids}
          currentId={loc.projectId}
          onPick={model.pickJob}
          onNewJob={model.newJob}
        />
      </header>
      <div className="flex min-h-0 flex-1">
        <Rail
          items={model.railItems}
          current={loc.tool}
          collapsed={choices.collapsed.rail}
          onSelect={model.selectTool}
          onToggleCollapsed={() => {
            model.save({ collapsed: { ...choices.collapsed, rail: !choices.collapsed.rail } });
          }}
        />
        {rightFull ? null : (
          <main data-testid="main-area" data-tool={loc.tool} className="min-w-0 flex-1 overflow-auto p-4">
            <ToolView model={model} tool={loc.tool} folderId={folderId} isPhone={false} />
          </main>
        )}
        {showRight ? (
          <RightColumn
            title={itemOpen ? itemTitle(loc.tool) : 'Board'}
            collapsed={rightCollapsed}
            full={rightFull}
            onToggleCollapsed={() => {
              model.save({ collapsed: { ...choices.collapsed, right: !choices.collapsed.right } });
            }}
            onToggleFull={() => {
              model.setRightFull(!model.rightFull);
            }}
            onCloseItem={itemOpen ? model.closeItem : undefined}
          >
            {loc.itemId !== null ? (
              <ItemView model={model} tool={loc.tool} itemId={loc.itemId} standalone={false} />
            ) : (
              <Docked model={model} />
            )}
          </RightColumn>
        ) : null}
      </div>
    </div>
  );
}
