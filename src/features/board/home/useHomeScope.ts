// What the home (All my jobs) holds, decided job by job by my capabilities there (my_capabilities, has_capability),
// never by role names (Jesse, Oct 12: "I would never use Bids"). Someone with several roles across jobs gets each
// job's share: inspections today where I inspect or request, RFIs waiting where I write or issue them, open bids
// where I run bids. A tool the job has off counts nowhere.
import { useMemo } from 'react';
import { useJobsWithCapability, useMyProjects } from '../../../data/queries';
import { toolIsOn } from '../../../lib/jobs';

interface HomeScope {
  /** Job ids per part; undefined until every answer is in. */
  inspections: string[] | undefined;
  /** Of those, the jobs where I decide fire marshal (OFS) requests: their chips read the deputy's way. */
  ofs: string[] | undefined;
  rfis: string[] | undefined;
  bids: string[] | undefined;
  error: Error | null;
  refetch: () => void;
}

function union(...lists: (string[] | undefined)[]): string[] | undefined {
  if (lists.some((l) => l === undefined)) return undefined;
  return [...new Set(lists.flatMap((l) => l ?? []))];
}

/** `enabled` false (a job's own board): asks nothing and holds nothing. */
export function useHomeScope(enabled = true): HomeScope {
  const projects = useMyProjects();
  const on = useMemo(() => {
    const jobs = enabled ? (projects.data ?? []) : [];
    const ids = (tool: string) => jobs.filter((p) => toolIsOn(tool, p.modules)).map((p) => p.project_id);
    return { inspections: ids('inspections'), rfis: ids('rfis'), bids: ids('bids') };
  }, [enabled, projects.data]);

  const decide = useJobsWithCapability(on.inspections, 'ir.decide');
  const ofs = useJobsWithCapability(on.inspections, 'ir.ofs_decide');
  const ask = useJobsWithCapability(on.inspections, 'ir.request');
  const draft = useJobsWithCapability(on.rfis, 'rfi.create_draft');
  const issue = useJobsWithCapability(on.rfis, 'rfi.sign_issue');
  const bids = useJobsWithCapability(on.bids, 'bids.manage');
  const all = [decide, ofs, ask, draft, issue, bids];
  const known = !enabled || projects.data !== undefined;

  return {
    inspections: known ? union(decide.ids, ofs.ids, ask.ids) : undefined,
    ofs: known ? ofs.ids : undefined,
    rfis: known ? union(draft.ids, issue.ids) : undefined,
    bids: known ? bids.ids : undefined,
    error: all.find((r) => r.error !== null)?.error ?? null,
    refetch: () => {
      for (const r of all) r.refetch();
    },
  };
}
