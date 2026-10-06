// Goes where a record lives (lib/entityTarget): its tool on its job, with the item open and the tool's sub-view.
// The calendar's mirrored lines and the board's opened lines both go through here. Router only.
import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { EntityTarget } from '../../lib/entityTarget';

/** Search the owning tool needs to show the record in place, known only to the caller (Files: the file's folder). */
export interface OpenExtra {
  folder?: string;
  /** Leaves a Back in the top bar to where the jump started (a board line's "Open in RFIs"). */
  back?: '1';
}

export function useOpenTarget(): (projectId: string, target: EntityTarget, extra?: OpenExtra) => void {
  const navigate = useNavigate();
  return useCallback(
    (projectId: string, target: EntityTarget, extra: OpenExtra = {}) => {
      const search = { ...(target.view === undefined ? {} : { view: target.view }), ...extra };
      const params = { projectId, tool: target.tool };
      if (target.itemId === null) void navigate({ to: '/p/$projectId/$tool', params, search });
      else void navigate({ to: '/p/$projectId/$tool/$itemId', params: { ...params, itemId: target.itemId }, search });
    },
    [navigate],
  );
}
