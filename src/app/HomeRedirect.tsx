// "/" has no home screen (SPEC §7.2): it opens the person's default tool on their most recent job, or the setup flow
// when they have no jobs yet.
import { Navigate } from '@tanstack/react-router';
import { useMyProjects, useUserLayout } from '../data/queries';
import { SetupFlow } from '../features/setup/SetupFlow';
import { toolIsOn } from '../lib/jobs';
import { ErrorState, LoadingState } from '../ui/States';

export function HomeRedirect() {
  const layout = useUserLayout();
  const projects = useMyProjects();

  if (layout.isPending || projects.isPending) return <LoadingState label="Opening your jobs" />;
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;

  const list = projects.data;
  // No jobs yet: set up the company, then add the first job (SPEC §5.1).
  if (list.length === 0) return <SetupFlow />;

  const { recent_project_ids: recent, main_default } = layout.data.choices;
  const recentId = recent.find((id) => list.some((p) => p.project_id === id));
  const project = list.find((p) => p.project_id === recentId) ?? list[0];
  if (!project) return <Navigate to="/all/board" replace />;
  // My default tool, unless this job has it switched off.
  const tool = toolIsOn(main_default, project.modules) ? main_default : 'board';
  return <Navigate to="/p/$projectId/$tool" params={{ projectId: project.project_id, tool }} replace />;
}
