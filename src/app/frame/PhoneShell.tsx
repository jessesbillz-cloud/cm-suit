// The phone layout (SPEC §7.7): its own layout, not a shrunken desktop. Job picker on top; along the bottom the same
// choice as the desktop rail (lib/jobs phoneRail): on a job its Board (the phone has no right column), then the job's
// tools in my order, each with its count; on All my jobs the cross-job tools. More for the rest, and on a job "Edit
// tools" to choose them. One screen at a time, items full screen with a back button.
import { useState } from 'react';
import { phoneRail } from '../../lib/jobs';
import { phoneTabs, type Tool } from '../../lib/layout';
import { JobPicker } from '../../ui/JobPicker';
import { JobToolsEdit } from '../../ui/JobToolsEdit';
import { ViewAs } from '../../ui/ViewAs';
import { PanelBack, PanelMoreSheet, PanelScreen, PanelTabBar } from '../../ui/Panel';
import { TOOL_META } from '../../ui/tools';
import { ItemView } from './ItemView';
import { preloadTool } from './lazyTools';
import { ToolView } from './ToolView';
import type { FrameModel } from './useFrameModel';

interface PhoneShellProps {
  model: FrameModel;
  folderId: string | null;
}

/** What sits above the tab bar: nothing, the More sheet, or the job's tools to choose. */
type Sheet = 'none' | 'more' | 'edit';

export function PhoneShell({ model, folderId }: PhoneShellProps) {
  const { loc, choices, jobPart } = model;
  const [sheet, setSheet] = useState<Sheet>('none');
  if (!choices) return null;

  const { tabs, more } = phoneTabs(phoneRail(model.rail), loc.tool, model.rail.more);
  const pick: typeof model.selectTool = (t) => {
    setSheet('none');
    model.selectTool(t);
  };
  const preload = (t: Tool) => {
    preloadTool(t, loc.projectId !== null);
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
              allJobsTools={model.allJobsTools}
            />
          </div>
          <ViewAs />
        </div>
      }
      bottom={
        <>
          {sheet === 'more' ? (
            <PanelMoreSheet
              tools={more}
              current={loc.tool}
              counts={model.counts}
              onSelect={pick}
              onEdit={
                jobPart
                  ? () => {
                      setSheet('edit');
                    }
                  : undefined
              }
            />
          ) : null}
          {sheet === 'edit' && jobPart ? (
            <div data-testid="phone-job-tools" className="flex max-h-[60dvh] shrink-0 flex-col border-t border-line bg-card">
              <p className="shrink-0 break-words px-3 pt-3 text-sm font-semibold text-ink wrap-anywhere">{jobPart.label}</p>
              <JobToolsEdit
                {...jobPart.edit}
                onDone={() => {
                  setSheet('none');
                }}
              />
            </div>
          ) : null}
          <PanelTabBar
            tools={tabs}
            current={loc.tool}
            onSelect={pick}
            counts={model.counts}
            moreTools={more}
            moreOpen={sheet !== 'none'}
            onPreload={preload}
            onMore={() => {
              // Opening More starts loading its tools' code, so the tap on one doesn't wait.
              if (sheet === 'none') more.forEach(preload);
              setSheet(sheet === 'none' ? 'more' : 'none');
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
