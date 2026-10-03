// One request in the right column (or full screen on the phone): the tracker (Submitted → (GC) → Inspector →
// Result), the notes, "View IR" once done, history behind one link, and what I may do: move or withdraw my own, the
// GC step when it's on, the inspector's steps. The database decides each one again. An OFS request with walls also
// shows its walls and items (with their results) and its map.
import { useState } from 'react';
import { useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { useDownloadIrFile } from '../../data/inspections.mutations';
import { useIrFileNames, useIrRequest } from '../../data/inspections.queries';
import type { IrRequest } from '../../data/inspections.types';
import { useIrRevItems } from '../../data/revs.queries';
import { formatDay } from '../../lib/dates';
import { ofsIrLabel } from '../../lib/markup';
import { PaneSection, ReadingPane } from '../../ui/ReadingPane';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { GcActions } from './GcActions';
import { History } from './History';
import { InspectorPanel } from './InspectorPanel';
import { IrMap } from './IrMap';
import { ownsSteps, requestChip, trackerSteps, typeLabel } from './model';
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

function RequestBody({ row, can, job, onOpenWindow }: BodyProps) {
  const user = useUser();
  const toast = useToast();
  const download = useDownloadIrFile();
  const names = useIrFileNames(row.project_id, row.attachment_ids);
  const [history, setHistory] = useState(false);
  const chip = requestChip(row);
  const mine = row.requested_by === user.id;
  const atGc = row.status === 'gc_review' || row.status === 'returned';
  const cells = useIrRevItems(row.kind === 'ofs' ? row.id : null);
  const revs = cells.data !== undefined && cells.data.length > 0 ? cells.data : null;
  // The deputy records each wall in his Result step; everyone else sees the walls with their results here.
  const deciding = can.decide && ownsSteps(row, user.id) && row.status !== 'postponed';

  function view(fileId?: string) {
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
        view(id);
      }}
      downloadingId={download.isPending ? download.variables.fileId : null}
      onHistory={() => {
        setHistory(!history);
      }}
      onOpenWindow={onOpenWindow}
    >
      <div className="flex flex-col gap-4" data-testid="ir-pane">
        <div className="rounded-lg bg-page/70 px-1 py-3">
          <Tracker steps={trackerSteps(row, job.gcStep)} />
        </div>
        <RequestDetails
          row={row}
          tz={job.tz}
          viewing={download.isPending && download.variables.fileId === undefined}
          viewIsMain={!can.decide}
          walls={revs !== null}
          onViewIr={() => {
            view();
          }}
        />
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
        {mine && can.request ? <RequesterActions row={row} canMove={!can.decide} /> : null}
        {can.gcApprove && atGc ? <GcActions row={row} /> : null}
        {can.decide ? <InspectorPanel row={row} me={user.id} jobName={job.name} revs={revs} /> : null}
        {history ? <History projectId={row.project_id} requestId={row.id} tz={job.tz} visitor={row.requester_name} /> : null}
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
