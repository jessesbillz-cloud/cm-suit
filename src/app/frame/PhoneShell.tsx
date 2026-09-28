// The phone layout (SPEC §7.7): its own layout, not a shrunken desktop. Job picker on top, the person's top tools
// along the bottom, one screen at a time, items full screen with a back button.
import { useState } from 'react';
import { phoneTabs } from '../../lib/layout';
import { JobPicker } from '../../ui/JobPicker';
import { ViewAs } from '../../ui/ViewAs';
import { PanelBack, PanelMoreSheet, PanelScreen, PanelTabBar } from '../../ui/Panel';
import { TOOL_META } from '../../ui/tools';
import { ItemView } from './ItemView';
import { ToolView } from './ToolView';
import type { FrameModel } from './useFrameModel';

interface PhoneShellProps {
  model: FrameModel;
  folderId: string | null;
}

export function PhoneShell({ model, folderId }: PhoneShellProps) {
  const { loc, choices } = model;
  const [moreOpen, setMoreOpen] = useState(false);
  if (!choices) return null;

  const { tabs, more } = phoneTabs(model.railItems, loc.tool);
  const pick: typeof model.selectTool = (t) => {
    setMoreOpen(false);
    model.selectTool(t);
  };

  if (loc.itemId !== null) {
    return (
      <PanelScreen top={<PanelBack label={TOOL_META[loc.tool].label} onBack={model.closeItem} />}>
        <div className="min-h-full bg-card">
          <ItemView model={model} tool={loc.tool} itemId={loc.itemId} standalone={false} />
        </div>
      </PanelScreen>
    );
  }

  return (
    <PanelScreen
      top={
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <JobPicker
              projects={model.projects}
              recentIds={choices.recent_project_ids}
              currentId={loc.projectId}
              onPick={model.pickJob}
              onNewJob={model.newJob}
            />
          </div>
          <ViewAs />
        </div>
      }
      bottom={
        <>
          {moreOpen ? <PanelMoreSheet tools={more} current={loc.tool} onSelect={pick} /> : null}
          <PanelTabBar
            tools={tabs}
            current={loc.tool}
            onSelect={pick}
            moreOpen={moreOpen}
            onMore={() => {
              setMoreOpen(!moreOpen);
            }}
          />
        </>
      }
    >
      <main data-testid="main-area" data-tool={loc.tool} className="p-3">
        <ToolView model={model} tool={loc.tool} folderId={folderId} isPhone />
      </main>
    </PanelScreen>
  );
}
