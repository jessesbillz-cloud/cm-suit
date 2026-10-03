// What fills the main area for each tool. The board, calendar, bids (the pipeline) and permits (the official's
// caseload) also work for "All my jobs",
// and Timesheets is only there; the rest need a job. A tool the job has switched off (projects.modules) shows a one-line note instead.
// Each tool's code loads on first use (lazyTools); until it has, the main area shows the usual loading line.
import { Suspense } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toolIsOn } from '../../lib/jobs';
import type { Tool } from '../../lib/layout';
import { Card } from '../../ui/Card';
import { EmptyState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import {
  BidPipeline,
  BidsTool,
  Board,
  CalendarTool,
  CorrectionsTool,
  DailiesTool,
  DeliveriesTool,
  FilesTool,
  HoursTool,
  InspectionsTool,
  PeopleTool,
  PermitsTool,
  RevsTool,
  RfisTool,
  SafetyTool,
  SettingsTool,
  TimesheetsTool,
} from './lazyTools';
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

function ToolScreen({ model, tool, folderId, isPhone }: ToolViewProps) {
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
      // "All my jobs": the pipeline of every job I bid; picking a row opens that job's Bids.
      if (projectId === null) return <BidPipeline isPhone={isPhone} onOpenJob={model.pickJob} />;
      return <BidsTool projectId={projectId} itemId={itemId} />;
    case 'people':
      if (projectId === null) return <NeedsJob what="people" />;
      return <PeopleTool projectId={projectId} />;
    case 'settings':
      return <SettingsTool projectId={projectId} />;
    case 'calendar':
      return <CalendarTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'dailies':
      if (projectId === null) return <NeedsJob what="dailies" />;
      return <DailiesTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'inspections':
      if (projectId === null) return <NeedsJob what="inspections" />;
      return <InspectionsTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'revs':
      if (projectId === null) return <NeedsJob what="revs" />;
      return <RevsTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'deliveries':
      if (projectId === null) return <NeedsJob what="deliveries" />;
      return <DeliveriesTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'corrections':
      if (projectId === null) return <NeedsJob what="corrections" />;
      return <CorrectionsTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'rfis':
      if (projectId === null) return <NeedsJob what="RFIs" />;
      return <RfisTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'permits':
      // All my jobs: every permit I may read across my jobs (the official's caseload).
      return <PermitsTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'safety':
      if (projectId === null) return <NeedsJob what="safety meetings" />;
      return <SafetyTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'hours':
      if (projectId === null) return <NeedsJob what="hours" />;
      return <HoursTool projectId={projectId} itemId={itemId} isPhone={isPhone} />;
    case 'timesheets':
      // Mine across every job (All my jobs); a job's own hours are its Hours tool.
      return <TimesheetsTool itemId={itemId} isPhone={isPhone} />;
  }
}

export function ToolView(props: ToolViewProps) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ToolScreen {...props} />
    </Suspense>
  );
}
