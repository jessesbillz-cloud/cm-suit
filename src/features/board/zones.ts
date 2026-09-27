// Board times show in each job's own time zone (CLAUDE.md rule 14).
import { useMemo } from 'react';
import { useMyProjects } from '../../data/queries';

function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** project_id -> IANA zone, with the device zone for anything unknown. */
export function useProjectZones(): (projectId: string) => string {
  const projects = useMyProjects();
  return useMemo(() => {
    const map = new Map((projects.data ?? []).map((p): [string, string] => [p.project_id, p.timezone]));
    const fallback = deviceZone();
    return (projectId: string) => map.get(projectId) ?? fallback;
  }, [projects.data]);
}
