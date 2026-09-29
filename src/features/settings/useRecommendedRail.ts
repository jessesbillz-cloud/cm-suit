// The rail Settings starts from when I have no pins: my position's tools on the job Settings is open for (on
// "All my jobs", my most recent job), the same list the frame shows (lib/jobs jobRail).
import { useMyProjects } from '../../data/queries';
import { useRecommendedTools } from '../../data/rail.queries';
import { jobRail, type RailModel } from '../../lib/jobs';

export function useRecommendedRail(projectId: string | null, recentIds: readonly string[]) {
  const projects = useMyProjects();
  const recommended = useRecommendedTools();
  const mine = projects.data ?? [];
  const job =
    mine.find((p) => p.project_id === projectId) ??
    mine.find((p) => p.project_id === recentIds.find((id) => mine.some((m) => m.project_id === id))) ??
    mine[0];
  const data: RailModel | undefined =
    projects.data && recommended.data ? jobRail(null, job ? (recommended.data[job.project_id] ?? []) : [], job?.modules ?? []) : undefined;
  return {
    data,
    isPending: projects.isPending || recommended.isPending,
    error: projects.error ?? recommended.error,
    refetch: () => {
      void projects.refetch();
      void recommended.refetch();
    },
  };
}
