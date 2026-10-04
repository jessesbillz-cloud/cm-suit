// Everything the desktop frame and the phone shell share: the current job/tool/item, layout choices, and the
// navigation moves. Navigation is always through the router (CLAUDE.md rule 10: no window events for app flow).
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMyProjects, useUserLayout } from '../../data/queries';
import { useSaveLayout } from '../../data/mutations';
import { messageOf } from '../../data/errors';
import { jobRailChoices, useJobRails } from '../../data/jobRail.queries';
import { useSaveJobRail } from '../../data/jobRail.mutations';
import { useRecommendedTools, useToolCounts } from '../../data/rail.queries';
import { allJobsTool, jobTool, railModel } from '../../lib/jobs';
import { pushRecent, type LayoutChoices, type RailTool, type Tool } from '../../lib/layout';
import { countsByTool } from '../../lib/toolCounts';
import type { RailJobPart } from '../../ui/Rail';
import { useToast } from '../../ui/Toast';
import { inAppPath } from '../../lib/basePath';

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
  permits: '/all/permits',
} as const;

/** "All my jobs" tools that open items in the right column (the board's lines are the default). */
function allItemTool(tool: Tool): 'calendar' | 'timesheets' | 'permits' | 'board' {
  return tool === 'calendar' || tool === 'timesheets' || tool === 'permits' ? tool : 'board';
}

export function useFrameModel(loc: FrameLocation) {
  const navigate = useNavigate();
  const toast = useToast();
  const layoutQuery = useUserLayout();
  const projectsQuery = useMyProjects();
  const recommendedQuery = useRecommendedTools();
  const jobRailsQuery = useJobRails();
  const countsQuery = useToolCounts(loc.projectId);
  const saveLayout = useSaveLayout();
  const saveTools = useSaveJobRail((e) => {
    toast.show({ tone: 'error', message: `Your tools were not saved: ${messageOf(e)}` });
  });
  const [rightFull, setRightFull] = useState(false);

  const choices: LayoutChoices | undefined = layoutQuery.data?.choices;
  const projects = projectsQuery.data ?? [];
  const current = projects.find((p) => p.project_id === loc.projectId);
  /** The rail (lib/jobs railModel): on All my jobs the cross-job tools; on a job only its tools in my order, and More. */
  const rail = railModel(loc.projectId, projects, recommendedQuery.data ?? {}, jobRailChoices(jobRailsQuery.data));
  /** What needs me, per tool on this rail (the rest counts on the Board). */
  const counts = countsByTool(countsQuery.data ?? [], [...rail.general, ...rail.job, ...rail.more]);

  function save(patch: Partial<LayoutChoices>) {
    saveLayout.mutate(patch, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Your layout was not saved: ${messageOf(e)}` });
      },
    });
  }

  /** A new list of tools under the job's name; going back to the recommendation can be undone. */
  function chooseTools(projectId: string, tools: readonly RailTool[] | null) {
    const before = jobRailsQuery.data?.[projectId]?.tools ?? null;
    saveTools(projectId, tools);
    if (tools !== null || before === null) return;
    const mine = rail.job;
    toast.show({
      message: 'Back to recommended.',
      action: {
        label: 'Undo',
        onClick: () => {
          saveTools(projectId, mine);
        },
      },
    });
  }

  /** The picked job's part of the rail (null on All my jobs): its name, my tools there, More, and my choice of them. */
  const jobPart: RailJobPart | null = current
    ? {
        label: current.name,
        tools: rail.job,
        more: rail.more,
        edit: {
          tools: [...rail.job, ...rail.more],
          chosen: rail.job,
          own: (jobRailsQuery.data?.[current.project_id]?.tools ?? null) !== null,
          onChange: (tools) => {
            chooseTools(current.project_id, tools);
          },
        },
        version: jobRailsQuery.data?.[current.project_id]?.version ?? null,
      }
    : null;

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
    return inAppPath(`${base}?window=1`);
  }

  return {
    loc,
    layoutQuery,
    projectsQuery,
    recommendedQuery,
    jobRailsQuery,
    choices,
    projects,
    rail,
    jobPart,
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
