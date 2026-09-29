// Everything the desktop frame and the phone shell share: the current job/tool/item, layout choices, and the
// navigation moves. Navigation is always through the router (CLAUDE.md rule 10: no window events for app flow).
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMyProjects, useUserLayout } from '../../data/queries';
import { useSaveLayout } from '../../data/mutations';
import { messageOf } from '../../data/errors';
import { useRecommendedTools, useToolCounts } from '../../data/rail.queries';
import { allJobsRail, allJobsTool, jobRail, jobTool, type RailModel } from '../../lib/jobs';
import { pushRecent, type LayoutChoices, type Tool } from '../../lib/layout';
import { countsByTool } from '../../lib/toolCounts';
import { useToast } from '../../ui/Toast';

export interface FrameLocation {
  /** null = "All my jobs": the tools that work across jobs (lib/jobs ALL_JOBS_TOOLS) and Settings. */
  projectId: string | null;
  tool: Tool;
  itemId: string | null;
}

const ALL_JOBS_PATH = {
  board: '/all/board',
  calendar: '/all/calendar',
  bids: '/all/bids',
  settings: '/all/settings',
  timesheets: '/all/timesheets',
} as const;

/** "All my jobs" tools that open items in the right column (the board's lines are the default). */
function allItemTool(tool: Tool): 'calendar' | 'timesheets' | 'board' {
  return tool === 'calendar' || tool === 'timesheets' ? tool : 'board';
}

export function useFrameModel(loc: FrameLocation) {
  const navigate = useNavigate();
  const toast = useToast();
  const layoutQuery = useUserLayout();
  const projectsQuery = useMyProjects();
  const recommendedQuery = useRecommendedTools();
  const countsQuery = useToolCounts(loc.projectId);
  const saveLayout = useSaveLayout();
  const [rightFull, setRightFull] = useState(false);

  const choices: LayoutChoices | undefined = layoutQuery.data?.choices;
  const projects = projectsQuery.data ?? [];
  const current = projects.find((p) => p.project_id === loc.projectId);
  /**
   * The rail: my pins, else my role's recommendation on this job, minus the modules it has switched off; the job's
   * other tools under More. On "All my jobs", only the cross-job tools.
   */
  const { rail: railItems, more: moreItems }: RailModel = !choices
    ? { rail: [], more: [] }
    : loc.projectId === null
      ? allJobsRail(choices.rail_items, projects.map((p) => p.modules), Object.values(recommendedQuery.data ?? {}))
      : jobRail(choices.rail_items, recommendedQuery.data?.[loc.projectId] ?? [], current?.modules ?? []);
  /** What needs me, per tool on this rail (the rest counts on the Board). */
  const counts = countsByTool(countsQuery.data ?? [], [...railItems, ...moreItems]);

  function save(patch: Partial<LayoutChoices>) {
    saveLayout.mutate(patch, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Your layout was not saved: ${messageOf(e)}` });
      },
    });
  }

  /** On "All my jobs" a tool that needs a job lands on the board, never on some job picked for me. */
  function go(projectId: string | null, tool: Tool) {
    if (projectId === null) {
      void navigate({ to: ALL_JOBS_PATH[allJobsTool(tool)] });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: jobTool(tool) } });
  }

  /** Job picker: switching keeps the current tool (SPEC §7.2); "All my jobs" keeps it when it works across jobs. */
  function pickJob(projectId: string | null) {
    if (projectId !== null && choices) save({ recent_project_ids: pushRecent(choices.recent_project_ids, projectId) });
    go(projectId, loc.tool);
  }

  function newJob() {
    void navigate({ to: '/new-job' });
  }

  function selectTool(tool: Tool) {
    setRightFull(false);
    go(loc.projectId, tool);
  }

  /** Opens an item in the right column (desktop) or full screen (phone). */
  function openItem(tool: Tool, itemId: string, projectId: string | null = loc.projectId) {
    if (projectId === null) {
      void navigate({ to: `/all/${allItemTool(tool)}/$itemId`, params: { itemId } });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool, itemId } });
  }

  /** Closing keeps the tool's search (e.g. the Files folder or the Bids sub-view), so the main area stays put. */
  function closeItem() {
    setRightFull(false);
    if (loc.projectId === null) {
      void navigate({ to: `/all/${allItemTool(loc.tool)}`, search: true });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool', params: { projectId: loc.projectId, tool: loc.tool }, search: true });
  }

  function itemWindowHref(tool: Tool, itemId: string, projectId: string | null = loc.projectId): string {
    const base = projectId === null ? `/all/${allItemTool(tool)}/${itemId}` : `/p/${projectId}/${tool}/${itemId}`;
    return `${base}?window=1`;
  }

  return {
    loc,
    layoutQuery,
    projectsQuery,
    recommendedQuery,
    choices,
    projects,
    railItems,
    moreItems,
    counts,
    rightFull,
    setRightFull,
    save,
    pickJob,
    newJob,
    selectTool,
    openItem,
    closeItem,
    itemWindowHref,
  };
}

export type FrameModel = ReturnType<typeof useFrameModel>;
