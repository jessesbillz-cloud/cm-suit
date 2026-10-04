// What I may do with inspections on this job, from has_capability (never role names), and the job's own facts the
// screens need (zone, name, company, the GC step setting).
import { useCapability, useProject } from '../../data/queries';

export interface IrCan {
  request: boolean;
  viewAll: boolean;
  decide: boolean;
  gcApprove: boolean;
  /** The deputy's rights (0061): decides, and reads, the OFS requests the inspector sent to OFS. Nothing else. */
  ofsDecide: boolean;
  ofsView: boolean;
  /** Share the job's request link (members.manage). */
  share: boolean;
}

/** May use the Inspections tool at all: asks, reads or decides requests; the deputy too (his OFS requests only). */
export function seesInspections(can: IrCan): boolean {
  return can.request || can.viewAll || can.decide || can.ofsDecide || can.ofsView;
}

export interface IrJob {
  id: string;
  orgId: string;
  name: string;
  tz: string;
  gcStep: boolean;
  ofs: boolean;
}

type Access =
  | { state: 'loading' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; can: IrCan; job: IrJob };

export function useIrAccess(projectId: string): Access {
  const request = useCapability(projectId, 'ir.request');
  const viewAll = useCapability(projectId, 'ir.view_all');
  const decide = useCapability(projectId, 'ir.decide');
  const gcApprove = useCapability(projectId, 'ir.gc_approve');
  const ofsDecide = useCapability(projectId, 'ir.ofs_decide');
  const ofsView = useCapability(projectId, 'ir.ofs_view');
  const share = useCapability(projectId, 'members.manage');
  const project = useProject(projectId);
  const queries = [request, viewAll, decide, gcApprove, ofsDecide, ofsView, share, project];

  const failed = queries.find((q) => q.isError);
  if (failed) {
    return {
      state: 'error',
      error: failed.error,
      retry: () => {
        for (const q of queries) if (q.isError) void q.refetch();
      },
    };
  }
  if (
    !project.data ||
    request.data === undefined ||
    viewAll.data === undefined ||
    decide.data === undefined ||
    gcApprove.data === undefined ||
    ofsDecide.data === undefined ||
    ofsView.data === undefined ||
    share.data === undefined
  ) {
    return { state: 'loading' };
  }
  const p = project.data;
  return {
    state: 'ready',
    can: {
      request: request.data,
      viewAll: viewAll.data,
      decide: decide.data,
      gcApprove: gcApprove.data,
      ofsDecide: ofsDecide.data,
      ofsView: ofsView.data,
      share: share.data,
    },
    job: {
      id: p.id,
      orgId: p.org_id,
      name: p.name,
      tz: p.timezone,
      gcStep: p.parsedSettings.ir_gc_approval,
      ofs: p.parsedSettings.ir_ofs_allowed,
    },
  };
}
