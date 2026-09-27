// "/" has no home screen (SPEC §7.2): it opens the person's default tool on their most recent job.
import { Navigate } from '@tanstack/react-router';
import { useMyProjects, useUserLayout } from '../data/queries';
import { Card } from '../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../ui/States';

export function HomeRedirect() {
  const layout = useUserLayout();
  const projects = useMyProjects();

  if (layout.isPending || projects.isPending) return <LoadingState label="Opening your jobs" />;
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;

  const list = projects.data;
  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <EmptyState
            title="You are not on any jobs yet."
            hint="When someone invites you, the job shows up here. Open the link in your invite email."
          />
        </Card>
      </div>
    );
  }

  const { recent_project_ids: recent, main_default: tool } = layout.data.choices;
  const projectId = recent.find((id) => list.some((p) => p.project_id === id)) ?? list[0]?.project_id;
  if (!projectId) return <Navigate to="/all/board" replace />;
  return <Navigate to="/p/$projectId/$tool" params={{ projectId, tool }} replace />;
}
