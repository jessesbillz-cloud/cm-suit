// Route components for /p/$projectId/$tool(/$itemId) and "All my jobs": /all/board(/$itemId), /all/calendar(/$itemId),
// /all/bids and /all/settings. They pick the desktop frame, the phone shell, or the single-item window (?window=1), after
// the layout and job list have loaded.
import { getRouteApi, useParams, useSearch } from '@tanstack/react-router';
import { isTool, type Tool } from '../../lib/layout';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { Frame } from './Frame';
import { ItemView } from './ItemView';
import { PhoneShell } from './PhoneShell';
import { useFrameModel, type FrameLocation } from './useFrameModel';
import { useIsPhone } from './useIsPhone';

const toolRoute = getRouteApi('/p/$projectId/$tool');

interface FrameSwitchProps {
  loc: FrameLocation;
  folderId: string | null;
  windowMode: boolean;
}

function FrameSwitch({ loc, folderId, windowMode }: FrameSwitchProps) {
  const model = useFrameModel(loc);
  const isPhone = useIsPhone();

  if (model.layoutQuery.isPending || model.projectsQuery.isPending || model.recommendedQuery.isPending || model.jobRailsQuery.isPending) {
    return <LoadingState label="Opening your jobs" />;
  }
  if (model.layoutQuery.isError) return <ErrorState error={model.layoutQuery.error} onRetry={() => void model.layoutQuery.refetch()} />;
  if (model.projectsQuery.isError) {
    return <ErrorState error={model.projectsQuery.error} onRetry={() => void model.projectsQuery.refetch()} />;
  }
  if (model.recommendedQuery.isError) {
    return <ErrorState error={model.recommendedQuery.error} onRetry={() => void model.recommendedQuery.refetch()} />;
  }
  if (model.jobRailsQuery.isError) {
    return <ErrorState error={model.jobRailsQuery.error} onRetry={() => void model.jobRailsQuery.refetch()} />;
  }
  if (loc.projectId !== null && !model.projects.some((p) => p.project_id === loc.projectId)) {
    return <EmptyState title="This job is not in your list." hint="Your access may have ended. Pick another job from the home screen." />;
  }

  if (windowMode && loc.itemId !== null) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl bg-card shadow-card">
        <ItemView model={model} tool={loc.tool} itemId={loc.itemId} standalone />
      </main>
    );
  }
  return isPhone ? <PhoneShell model={model} folderId={folderId} /> : <Frame model={model} folderId={folderId} />;
}

export function ProjectToolRoute() {
  const { projectId, tool } = toolRoute.useParams();
  const search = toolRoute.useSearch();
  const { itemId } = useParams({ strict: false });
  if (!isTool(tool)) return <EmptyState title="That page does not exist." />;
  return (
    <FrameSwitch
      loc={{ projectId, tool, itemId: itemId ?? null }}
      folderId={search.folder ?? null}
      windowMode={search.window === '1'}
    />
  );
}

interface AllJobsFrameProps {
  tool: Tool;
}

/** "All my jobs": the frame with no job, for a tool that works across jobs (lib/jobs ALL_JOBS_TOOLS) or Settings. */
function AllJobsFrame({ tool }: AllJobsFrameProps) {
  const { itemId } = useParams({ strict: false });
  const search: { window?: '1' | undefined } = useSearch({ strict: false });
  return <FrameSwitch loc={{ projectId: null, tool, itemId: itemId ?? null }} folderId={null} windowMode={search.window === '1'} />;
}

export function AllBoardRoute() {
  return <AllJobsFrame tool="board" />;
}

export function AllCalendarRoute() {
  return <AllJobsFrame tool="calendar" />;
}

export function AllBidsRoute() {
  return <AllJobsFrame tool="bids" />;
}

export function AllSettingsRoute() {
  return <AllJobsFrame tool="settings" />;
}

export function AllTimesheetsRoute() {
  return <AllJobsFrame tool="timesheets" />;
}
