// Where the bids pipeline is: the sort (?sort=) and the stages shown (?stages=) live in the URL, so going into a job
// and back keeps them. "New prospect" opens the new-job page with the stage prefilled. Router only.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { nextSort, parseSort, parseStages, sortParam, stagesParam, toggleStage, type PipelineSortKey, type PipelineStage } from './pipeline';

interface PipelineSearch {
  sort?: string | undefined;
  stages?: string | undefined;
}

/** What goes back into the URL: only set values (exactOptionalPropertyTypes). */
function clean(s: PipelineSearch): { sort?: string; stages?: string } {
  return { ...(s.sort ? { sort: s.sort } : {}), ...(s.stages ? { stages: s.stages } : {}) };
}

export function usePipelineNav() {
  const navigate = useNavigate();
  const search: PipelineSearch = useSearch({ strict: false });
  const sort = parseSort(search.sort);
  const stages = parseStages(search.stages);

  function go(next: PipelineSearch) {
    void navigate({ to: '/all/bids', search: clean(next), replace: true });
  }

  return {
    sort,
    stages,
    sortBy: (key: PipelineSortKey) => {
      go({ ...search, sort: sortParam(nextSort(sort, key)) });
    },
    toggle: (stage: PipelineStage) => {
      go({ ...search, stages: stagesParam(toggleStage(stages, stage)) });
    },
    newProspect: () => {
      void navigate({ to: '/new-job', search: { stage: 'prospect', tool: 'bids' } });
    },
  };
}
