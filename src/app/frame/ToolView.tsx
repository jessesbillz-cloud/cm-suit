// What fills the main area for each tool. Phase 0 ships board, files, people and settings.
import { useNavigate } from '@tanstack/react-router';
import type { Tool } from '../../lib/layout';
import { Board } from '../../features/board/Board';
import { FilesTool } from '../../features/files/FilesTool';
import { PeopleTool } from '../../features/people/PeopleTool';
import { SettingsTool } from '../../features/settings/SettingsTool';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
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

export function ToolView({ model, tool, folderId, isPhone }: ToolViewProps) {
  const navigate = useNavigate();
  const { projectId, itemId } = model.loc;

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
    case 'people':
      if (projectId === null) return <NeedsJob what="people" />;
      return <PeopleTool projectId={projectId} />;
    case 'settings':
      return <SettingsTool />;
    case 'calendar':
      return (
        <Card title="Calendar">
          <EmptyState title="The calendar arrives in Phase 2." hint="Inspections, deliveries and meetings will show here by week." />
        </Card>
      );
  }
}
