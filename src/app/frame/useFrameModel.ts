// Everything the desktop frame and the phone shell share: the current job/tool/item, layout choices, and the
// navigation moves. Navigation is always through the router (CLAUDE.md rule 10: no window events for app flow).
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMyProjects, useUserLayout } from '../../data/queries';
import { useSaveLayout } from '../../data/mutations';
import { messageOf } from '../../data/errors';
import { pushRecent, type LayoutChoices, type Tool } from '../../lib/layout';
import { useToast } from '../../ui/Toast';

export interface FrameLocation {
  /** null = all my jobs (board only). */
  projectId: string | null;
  tool: Tool;
  itemId: string | null;
}

export function useFrameModel(loc: FrameLocation) {
  const navigate = useNavigate();
  const toast = useToast();
  const layoutQuery = useUserLayout();
  const projectsQuery = useMyProjects();
  const saveLayout = useSaveLayout();
  const [rightFull, setRightFull] = useState(false);

  const choices: LayoutChoices | undefined = layoutQuery.data?.choices;
  const projects = projectsQuery.data ?? [];

  function save(patch: Partial<LayoutChoices>) {
    saveLayout.mutate(patch, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Your layout was not saved: ${messageOf(e)}` });
      },
    });
  }

  /** The job to use when a tool needs one and we are on "All my jobs": the most recent, else the first. */
  function fallbackProjectId(): string | null {
    const recent = choices?.recent_project_ids.find((id) => projects.some((p) => p.project_id === id));
    return recent ?? projects[0]?.project_id ?? null;
  }

  function go(projectId: string | null, tool: Tool) {
    if (projectId === null) {
      void navigate({ to: '/all/board' });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool } });
  }

  /** Job picker: switching keeps the current tool (SPEC §7.2). "All my jobs" exists for the board. */
  function pickJob(projectId: string | null) {
    if (projectId !== null && choices) save({ recent_project_ids: pushRecent(choices.recent_project_ids, projectId) });
    go(projectId, loc.tool);
  }

  function selectTool(tool: Tool) {
    setRightFull(false);
    if (loc.projectId === null && tool !== 'board') {
      go(fallbackProjectId(), tool);
      return;
    }
    go(loc.projectId, tool);
  }

  /** Opens an item in the right column (desktop) or full screen (phone). */
  function openItem(tool: Tool, itemId: string, projectId: string | null = loc.projectId) {
    if (projectId === null) {
      void navigate({ to: '/all/board/$itemId', params: { itemId } });
      return;
    }
    void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool, itemId } });
  }

  /** Closing keeps the tool's search (e.g. the Files folder or the Bids sub-view), so the main area stays put. */
  function closeItem() {
    setRightFull(false);
    if (loc.projectId === null) {
      go(null, loc.tool);
      return;
    }
    void navigate({ to: '/p/$projectId/$tool', params: { projectId: loc.projectId, tool: loc.tool }, search: true });
  }

  function itemWindowHref(tool: Tool, itemId: string, projectId: string | null = loc.projectId): string {
    const base = projectId === null ? `/all/board/${itemId}` : `/p/${projectId}/${tool}/${itemId}`;
    return `${base}?window=1`;
  }

  return {
    loc,
    layoutQuery,
    projectsQuery,
    choices,
    projects,
    rightFull,
    setRightFull,
    save,
    pickJob,
    selectTool,
    openItem,
    closeItem,
    itemWindowHref,
  };
}

export type FrameModel = ReturnType<typeof useFrameModel>;
