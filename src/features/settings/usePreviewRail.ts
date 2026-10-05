// The rail the Settings sketch draws: the one the frame shows here (lib/jobs railModel, the same model), the cross-job
// tools on All my jobs and, on a job, only its tools under its name. Each job's tools are chosen with Edit on the rail.
import { jobRailChoices, useJobRails } from '../../data/jobRail.queries';
import { useMyProjects } from '../../data/queries';
import { useReadableTools, useRecommendedTools } from '../../data/rail.queries';
import { railModel, type RailModel } from '../../lib/jobs';

export function usePreviewRail(projectId: string | null) {
  const projects = useMyProjects();
  const recommended = useRecommendedTools();
  const readable = useReadableTools();
  const rails = useJobRails();
  const data: RailModel | undefined =
    projects.data && recommended.data && readable.data && rails.data
      ? railModel(projectId, projects.data, recommended.data, jobRailChoices(rails.data), readable.data)
      : undefined;
  return {
    data,
    isPending: projects.isPending || recommended.isPending || readable.isPending || rails.isPending,
    error: projects.error ?? recommended.error ?? readable.error ?? rails.error,
    refetch: () => {
      void projects.refetch();
      void recommended.refetch();
      void readable.refetch();
      void rails.refetch();
    },
  };
}
