// Everything the desktop frame and the phone shell share: the current job/tool/item, layout choices, and the
// navigation moves. Navigation is always through the router (CLAUDE.md rule 10: no window events for app flow).
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMyProjects, useUserLayout } from '../../data/queries';
import { useSaveLayout } from '../../data/mutations';
import { messageOf } from '../../data/errors';
import { allJobsTool, railForAllJobs, railForJob } from '../../lib/jobs';
import { pushRecent, type LayoutChoices, type RailTool, type Tool } from '../../lib/layout';
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
} as const;

export function useFrameModel(loc: FrameLocation) {
  const navigate = useNavigate();
  const toast = useToast();
  const layoutQuery = useUserLayout();
  const projectsQuery = useMyProjects();
  const saveLayout = useSaveLayout();
  const [rightFull, setRightFull] = useState(false);

  const choices: LayoutChoices | undefined = layoutQuery.data?.choices;
  const projects = projectsQuery.data ?? [];
  const current = projects.find((p) => p.project_id === loc.projectId);
  /** My rail picks, minus the modules this job has switched off. On "All my jobs", only the cross-job tools. */
  const railItems: RailTool[] = !choices
    ? []
    : loc.projectId === null
      ? railForAllJobs(choices.rail_items, projects.map((p) => p.modules))
      : railForJob(choices.rail_items, current?.modules ?? []);

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
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool } });
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
      void navigate({ to: tool === 'calendar' ? '/all/calendar/$itemId' : '/all/board/$itemId', params: { itemId } });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool, itemId } });
  }

  /** Closing keeps the tool's search (e.g. the Files folder or the Bids sub-view), so the main area stays put. */
  function closeItem() {
    setRightFull(false);
    if (loc.projectId === null) {
      void navigate({ to: loc.tool === 'calendar' ? '/all/calendar' : '/all/board', search: true });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool', params: { projectId: loc.projectId, tool: loc.tool }, search: true });
  }

  function itemWindowHref(tool: Tool, itemId: string, projectId: string | null = loc.projectId): string {
    const base = projectId === null ? `/all/${tool === 'calendar' ? 'calendar' : 'board'}/${itemId}` : `/p/${projectId}/${tool}/${itemId}`;
    return `${base}?window=1`;
  }

  return {
    loc,
    layoutQuery,
    projectsQuery,
    choices,
    projects,
    railItems,
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
