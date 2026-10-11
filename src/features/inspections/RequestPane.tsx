// One request in the right column (or full screen on the phone): the tracker (Submitted → (GC) → Inspector →
// Result; an OFS request adds OFS before the result), the notes, "View IR" once done, history behind one link, and
// what I may do: move or withdraw my own, the GC step, the steps of whoever decides it now (model decidesRequest: the
// inspector, or the deputy once an OFS request is sent to OFS). On an OFS request the inspector only sends it on or
// postpones it (OfsRoute), and the job's OFS duty holder sends it once the inspector has checked it. An OFS request
// shows its chain and checks (OfsChecks, 0091). The database decides each one again. An OFS request with walls also
// shows its walls and items (with their results) and its map.
import { useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { useDownloadIrFile } from '../../data/inspections.mutations';
import { useDuties } from '../../data/inspections.ofs';
import { useIrFileNames, useIrRequest } from '../../data/inspections.queries';
import type { IrRequest } from '../../data/inspections.types';
import { useIrRevItems } from '../../data/revs.queries';
import type { IrRevItem } from '../../data/revs.types';
import { formatDay } from '../../lib/dates';
import { ofsIrLabel } from '../../lib/markup';
import { useFileViewer } from '../../ui/FileViewer';
import { PaneSection, ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { GcActions } from './GcActions';
import { History } from './History';
import { InspectorPanel } from './InspectorPanel';
import { irPdfItem } from './irItems';
import { OfsChecks } from './OfsChecks';
import { IrMap } from './IrMap';
import { decidesRequest, ownsSteps, requestChip, resultsNow, routesOnly, trackerSteps, typeLabel } from './model';
import { OfsRoute } from './OfsRoute';
import { RequestDetails } from './RequestDetails';
import { RequesterActions } from './RequesterActions';
import { RevCells } from './RevCells';
import { clockLabel, durationLabel } from './time';
import { Tracker } from './Tracker';
import { useIrAccess, type IrCan, type IrJob } from './useIrAccess';

interface RequestPaneProps {
  projectId: string;
  requestId: string;
  onOpenWindow?: (() => void) | undefined;
}

interface BodyProps {
  row: IrRequest;
  can: IrCan;
  job: IrJob;
  onOpenWindow?: (() => void) | undefined;
}

interface DeciderStepsProps {
  row: IrRequest;
  can: IrCan;
  me: string;
  jobName: string;
  revs: readonly IrRevItem[] | null;
  /** I hold the job's OFS requests duty (0091). */
  holder: boolean;
}

/** What whoever has the request does with it: the step cards (never a helper on an OFS request), or, on an OFS request
 *  in the inspector's hands (ir.decide), the route: send it on, then read only. */
function DeciderSteps({ row, can, me, jobName, revs, holder }: DeciderStepsProps) {
  const decides = decidesRequest(row, can);
  if (row.kind !== 'ofs') return decides ? <InspectorPanel row={row} me={me} jobName={jobName} revs={revs} /> : null;
  if (decides && !routesOnly(row)) return <InspectorPanel row={row} me={me} jobName={jobName} revs={revs} helper={false} />;
  return can.decide || holder ? <OfsRoute row={row} me={me} revs={revs} inspector={can.decide} /> : null;
}

function RequestBody({ row, can, job, onOpenWindow }: BodyProps) {
  const user = useUser();
  const toast = useToast();
  const download = useDownloadIrFile();
  const viewer = useFileViewer();
  const names = useIrFileNames(row.project_id, row.attachment_ids);
  const chip = requestChip(row, can.ofsDecide);
  const mine = row.requested_by === user.id;
  const atGc = row.status === 'gc_review' || row.status === 'returned';
  const cells = useIrRevItems(row.kind === 'ofs' ? row.id : null);
  const revs = cells.data !== undefined && cells.data.length > 0 ? cells.data : null;
  const decides = decidesRequest(row, can);
  const ofs = row.kind === 'ofs';
  const duties = useDuties(row.project_id, ofs);
  const duty = duties.data?.[0];
  const holder = duty !== undefined && duty.person_id === user.id;
  // My step cards show on this request (InspectorPanel). The deputy records each wall in his Result step as soon as
  // it is with OFS (no Confirm first); everyone else (and he, while it is postponed) sees the walls with their results here.
  const mySteps = decides && !routesOnly(row) && ownsSteps(row, user.id);
  const deciding = mySteps && resultsNow(row);

  function save(fileId?: string) {
    download.mutate(
      { requestId: row.id, fileId },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  }

  return (
    <ReadingPane
      number={row.ofs_number === null ? `IR ${String(row.number)}` : `IR ${String(row.number)} · ${ofsIrLabel(row.ofs_number)}`}
      title={`${typeLabel(row.kind, row.ir_special_kinds?.name ?? null)} · ${row.company}`}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          {formatDay(row.request_date, 'EEE, MMM d')} · {clockLabel(row.start_time)} · {durationLabel(row.duration_kind, row.duration_min)}
          <StatusChip status={chip.status} label={chip.label} />
        </span>
      }
      attachments={row.attachment_ids.map((id, i) => ({ id, name: names.data?.[id] ?? `Attachment ${String(i + 1)}` }))}
      onDownloadAttachment={(id) => {
        save(id);
      }}
      attachmentVia={{ requestId: row.id }}
      downloadingId={download.isPending ? download.variables.fileId : null}
      history={<History projectId={row.project_id} requestId={row.id} tz={job.tz} visitor={row.requester_name} />}
      onOpenWindow={onOpenWindow}
    >
      <div className="flex flex-col gap-4" data-testid="ir-pane">
        <div className="rounded-lg bg-page/70 px-1 py-3">
          <Tracker steps={trackerSteps(row, job.gcStep)} />
        </div>
        <RequestDetails
          row={row}
          tz={job.tz}
          downloading={download.isPending && download.variables.fileId === undefined}
          viewIsMain={!decides}
          walls={revs !== null}
          attendanceInSteps={mySteps}
          onViewIr={() => {
            viewer.open([irPdfItem(row.id, row.number)]);
          }}
          onDownloadIr={() => {
            save();
          }}
        />
        {duties.isError ? <ErrorState error={duties.error} onRetry={() => void duties.refetch()} className="m-0" /> : null}
        {ofs ? (
          <OfsChecks
            row={row}
            can={can}
            me={user.id}
            tz={job.tz}
            sender={can.decide || holder}
            holderName={duty?.person_name ?? null}
          />
        ) : null}
        {cells.isError ? <ErrorState error={cells.error} onRetry={() => void cells.refetch()} className="m-0" /> : null}
        {revs !== null && !deciding ? (
          <PaneSection title="Walls">
            <RevCells projectId={row.project_id} cells={revs} />
          </PaneSection>
        ) : null}
        {revs !== null ? (
          <PaneSection title="Map">
            <IrMap requestId={row.id} projectId={row.project_id} />
          </PaneSection>
        ) : null}
        {mine && can.request ? <RequesterActions row={row} canMove={!decides} /> : null}
        {can.gcApprove && atGc ? <GcActions row={row} /> : null}
        <DeciderSteps row={row} can={can} me={user.id} jobName={job.name} revs={revs} holder={holder} />
      </div>
    </ReadingPane>
  );
}

export function RequestPane({ projectId, requestId, onOpenWindow }: RequestPaneProps) {
  const access = useIrAccess(projectId);
  const request = useIrRequest(projectId, requestId);
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  if (request.isError) return <ErrorState error={request.error} onRetry={() => void request.refetch()} />;
  if (access.state === 'loading' || request.isPending) return <LoadingState label="Loading the inspection" />;
  if (request.data === null) return <EmptyState icon={TOOL_META.inspections.icon} title="That inspection isn't here." />;
  return <RequestBody row={request.data} can={access.can} job={access.job} onOpenWindow={onOpenWindow} />;
}
