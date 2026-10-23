// The designated person's start page (the job's board, for the inspector or the job's OFS duty holder on a job that
// takes OFS requests): the three boxes, then Waiting on OFS and Back from OFS (approved, not approved, passed, failed:
// each failed item to inspect again, 0109), each opening to its groups. A requester with OFS requests sent gets the two
// lists of his own (no boxes). A row opens the item where it lives (Files, RFIs, Inspections). An inspection shows where
// its time stands, with Accept when OFS picked another time (0108). Requests filed together from the request being
// built (0113) sit together under "Batch of 9".
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useOfsDesk } from '../../data/ofs';
import { useIrBatches, type BatchOf } from '../../data/revs.basket';
import type { DeskRow } from '../../data/ofs.types';
import { formatInZone } from '../../lib/dates';
import { entityTarget } from '../../lib/entityTarget';
import { CLICK_BOX } from '../../ui/box';
import { ErrorState } from '../../ui/States';
import { useProjectZones } from '../board/zones';
import { ScheduleBox } from '../inspections/ScheduleBox';
import { DeskBoxes } from './DeskBoxes';
import { Expander } from './Expander';
import { byBatch, deskLists, deskTitle, type DeskGroup } from './model';

const NO_BATCHES: BatchOf = new Map();

interface RowProps {
  row: DeskRow;
  projectId: string;
  zone: string;
  onOpen: (row: DeskRow) => void;
}

function DeskLine({ row, projectId, zone, onOpen }: RowProps) {
  const button = (
    <button
      type="button"
      data-testid="ofs-desk-row"
      data-state={row.state}
      className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left ${CLICK_BOX}`}
      onClick={() => {
        onOpen(row);
      }}
    >
      <span className="break-words text-sm font-medium text-ink wrap-anywhere">{deskTitle(row)}</span>
      <span className="text-xs text-ink-2">{formatInZone(row.at, zone, 'MMM d, yyyy')}</span>
    </button>
  );
  if (row.sched === null) return button;
  // An inspection: where its time stands, with Accept when OFS picked another one (0108).
  return (
    <div className="flex flex-col gap-1">
      {button}
      <ScheduleBox
        row={{ id: row.target_id, version: row.sched.version, project_id: projectId }}
        state={row.sched.state}
        date={row.sched.date}
        time={row.sched.time}
        note={row.sched.note}
        canAccept
      />
    </div>
  );
}

interface ListProps {
  id: string;
  projectId: string;
  label: string;
  groups: readonly DeskGroup[];
  zone: string;
  batches: BatchOf;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  onOpen: (row: DeskRow) => void;
}

/** A group's rows, the requests filed together (0113) under one "Batch of 9" line. */
function DeskRows({ rows, batches, ...line }: Omit<RowProps, 'row'> & { rows: readonly DeskRow[]; batches: BatchOf }) {
  return (
    <>
      {byBatch(rows, (r) => (r.kind === 'inspection' ? r.target_id : r.id), batches).map((run) =>
        run.batch === null ? (
          run.rows.map((r) => <DeskLine key={r.id} row={r} {...line} />)
        ) : (
          <div key={run.batch.id} className="flex flex-col gap-1 border-l-[3px] border-ink pl-2" data-testid="ofs-batch" data-size={run.batch.size}>
            <span className="heading px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">{`Batch of ${String(run.batch.size)}`}</span>
            {run.rows.map((r) => (
              <DeskLine key={r.id} row={r} {...line} />
            ))}
          </div>
        ),
      )}
    </>
  );
}

function DeskList({ id, projectId, label, groups, zone, batches, isOpen, toggle, onOpen }: ListProps) {
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <Expander id={id} label={label} count={count} open={isOpen(id)} onToggle={toggle}>
      {count === 0 ? <p className="px-1 text-sm text-ink-2">None.</p> : null}
      {groups.map((g) => (
        <Expander key={g.key} id={`${id}/${g.key}`} label={g.label} count={g.rows.length} open={isOpen(`${id}/${g.key}`)} onToggle={toggle} depth={1}>
          <DeskRows rows={g.rows} batches={batches} projectId={projectId} zone={zone} onOpen={onOpen} />
        </Expander>
      ))}
    </Expander>
  );
}

export function OfsDesk({ projectId }: { projectId: string }) {
  const desk = useOfsDesk(projectId);
  const batched = useIrBatches((desk.data?.rows ?? []).filter((r) => r.kind === 'inspection').map((r) => r.target_id));
  const zoneOf = useProjectZones();
  const navigate = useNavigate();
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  if (desk.isError) return <ErrorState error={desk.error} title="The OFS start page did not load." onRetry={() => void desk.refetch()} />;
  // Nobody's start page (or still asking): the board as it was.
  if (!desk.data) return null;
  const lists = deskLists(desk.data.rows);
  const batches = batched.data ?? NO_BATCHES;
  const isOpen = (id: string) => opened.has(id);
  const toggle = (id: string) => {
    setOpened((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const open = (row: DeskRow) => {
    const t = entityTarget(row.target_type, row.target_id);
    if (t?.itemId) void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: t.tool, itemId: t.itemId } });
  };
  const common = { projectId, zone: zoneOf(projectId), batches, isOpen, toggle, onOpen: open };
  return (
    <section className="flex flex-col gap-3" data-testid="ofs-desk">
      {desk.data.designated ? <DeskBoxes projectId={projectId} /> : null}
      <DeskList id="waiting" label="Waiting on OFS" groups={lists.waiting} {...common} />
      <DeskList id="back" label="Back from OFS" groups={lists.back} {...common} />
    </section>
  );
}
