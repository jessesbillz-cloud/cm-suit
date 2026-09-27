// The phone layout (SPEC §7.7): its own layout, not a shrunken desktop. Job picker on top, the person's top tools
// along the bottom, one screen at a time, items full screen with a back button.
import type { Tool } from '../../lib/layout';
import { JobPicker } from '../../ui/JobPicker';
import { PanelBack, PanelScreen, PanelTabBar } from '../../ui/Panel';
import { TOOL_META } from '../../ui/tools';
import { ItemView } from './ItemView';
import { ToolView } from './ToolView';
import type { FrameModel } from './useFrameModel';

const MAX_TABS = 4;

interface PhoneShellProps {
  model: FrameModel;
  folderId: string | null;
}

export function PhoneShell({ model, folderId }: PhoneShellProps) {
  const { loc, choices } = model;
  if (!choices) return null;

  const tabs: Tool[] = [...choices.rail_items.slice(0, MAX_TABS), 'settings'];

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
      top={<JobPicker projects={model.projects} recentIds={choices.recent_project_ids} currentId={loc.projectId} onPick={model.pickJob} />}
      bottom={<PanelTabBar tools={tabs} current={loc.tool} onSelect={model.selectTool} />}
    >
      <main data-testid="main-area" data-tool={loc.tool} className="p-3">
        <ToolView model={model} tool={loc.tool} folderId={folderId} isPhone />
      </main>
    </PanelScreen>
  );
}
