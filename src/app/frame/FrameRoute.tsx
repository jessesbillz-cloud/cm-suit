// Route components for /p/$projectId/$tool(/$itemId), /all/board(/$itemId) and /all/calendar(/$itemId). They pick the
// desktop frame, the phone shell, or the single-item window (?window=1), after the layout and job list have loaded.
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

  if (model.layoutQuery.isPending || model.projectsQuery.isPending) return <LoadingState label="Opening your jobs" />;
  if (model.layoutQuery.isError) return <ErrorState error={model.layoutQuery.error} onRetry={() => void model.layoutQuery.refetch()} />;
  if (model.projectsQuery.isError) {
    return <ErrorState error={model.projectsQuery.error} onRetry={() => void model.projectsQuery.refetch()} />;
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

const BOARD: Tool = 'board';

export function AllBoardRoute() {
  const { itemId } = useParams({ strict: false });
  const search: { window?: '1' | undefined } = useSearch({ strict: false });
  return <FrameSwitch loc={{ projectId: null, tool: BOARD, itemId: itemId ?? null }} folderId={null} windowMode={search.window === '1'} />;
}

const CALENDAR: Tool = 'calendar';

export function AllCalendarRoute() {
  const { itemId } = useParams({ strict: false });
  const search: { window?: '1' | undefined } = useSearch({ strict: false });
  return <FrameSwitch loc={{ projectId: null, tool: CALENDAR, itemId: itemId ?? null }} folderId={null} windowMode={search.window === '1'} />;
}
