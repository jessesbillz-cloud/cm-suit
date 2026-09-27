// What fills the main area for each tool: board, files, bids, people and settings (calendar arrives in Phase 2).
// A tool the job has switched off (projects.modules) shows a one-line note instead.
import { useNavigate } from '@tanstack/react-router';
import { toolIsOn } from '../../lib/jobs';
import type { Tool } from '../../lib/layout';
import { Board } from '../../features/board/Board';
import { BidsTool } from '../../features/bids/BidsTool';
import { FilesTool } from '../../features/files/FilesTool';
import { PeopleTool } from '../../features/people/PeopleTool';
import { SettingsTool } from '../../features/settings/SettingsTool';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import type { FrameModel } from './useFrameModel';

interface ToolViewProps {
  model: FrameModel;
  tool: Tool;
  folderId: string | null;
  isPhone: boolean;
}

function NeedsJob({ what }: { what: string }) {
  return (
    <Card>
      <EmptyState title={`Pick a job to see its ${what}.`} hint="Use the job picker at the top left." />
    </Card>
  );
}

function ToolOff({ tool }: { tool: Tool }) {
  return (
    <Card>
      <EmptyState title={`${TOOL_META[tool].label} is off for this job.`} hint="Turn it on in Settings." />
    </Card>
  );
}

export function ToolView({ model, tool, folderId, isPhone }: ToolViewProps) {
  const navigate = useNavigate();
  const { projectId, itemId } = model.loc;
  const job = model.projects.find((p) => p.project_id === projectId);
  if (job && !toolIsOn(tool, job.modules)) return <ToolOff tool={tool} />;

  switch (tool) {
    case 'board':
      return (
        <Board
          projectId={projectId}
          selectedId={itemId}
          whatsNewEnabled={model.choices?.whats_new_enabled ?? true}
          onOpen={(line) => {
            model.openItem('board', line.id);
          }}
        />
      );
    case 'files':
      if (projectId === null) return <NeedsJob what="files" />;
      return (
        <FilesTool
          projectId={projectId}
          folderId={folderId}
          selectedFileId={itemId}
          isPhone={isPhone}
          onSelectFolder={(folder) => {
            void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'files' }, search: { folder } });
          }}
          onOpenFile={(fileId) => {
            void navigate({
              to: '/p/$projectId/$tool/$itemId',
              params: { projectId, tool: 'files', itemId: fileId },
              search: folderId ? { folder: folderId } : {},
            });
          }}
        />
      );
    case 'bids':
      if (projectId === null) return <NeedsJob what="bids" />;
      return <BidsTool projectId={projectId} itemId={itemId} />;
    case 'people':
      if (projectId === null) return <NeedsJob what="people" />;
      return <PeopleTool projectId={projectId} />;
    case 'settings':
      return <SettingsTool projectId={projectId} />;
    case 'calendar':
      return (
        <Card title="Calendar">
          <EmptyState title="The calendar arrives in Phase 2." hint="Inspections, deliveries and meetings will show here by week." />
        </Card>
      );
  }
}
