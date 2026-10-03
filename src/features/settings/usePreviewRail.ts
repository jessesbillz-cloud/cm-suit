// The rail the Settings sketch draws: the one the frame shows here (lib/jobs railModel, the same model), the cross-job
// tools on All my jobs and, on a job, only its tools under its name. Each job's tools are chosen with Edit on the rail.
import { jobRailChoices, useJobRails } from '../../data/jobRail.queries';
import { useMyProjects } from '../../data/queries';
import { useRecommendedTools } from '../../data/rail.queries';
import { railModel, type RailModel } from '../../lib/jobs';

export function usePreviewRail(projectId: string | null) {
  const projects = useMyProjects();
  const recommended = useRecommendedTools();
  const rails = useJobRails();
  const data: RailModel | undefined =
    projects.data && recommended.data && rails.data
      ? railModel(projectId, projects.data, recommended.data, jobRailChoices(rails.data))
      : undefined;
  return {
    data,
    isPending: projects.isPending || recommended.isPending || rails.isPending,
    error: projects.error ?? recommended.error ?? rails.error,
    refetch: () => {
      void projects.refetch();
      void recommended.refetch();
      void rails.refetch();
    },
  };
}
