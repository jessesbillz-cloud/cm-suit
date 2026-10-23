// The designated person's start page (the job's board, for the inspector or the job's OFS duty holder on a job that
// takes OFS requests): the three boxes, then Waiting on OFS and Back from OFS (approved, not approved, passed, failed:
// each failed item to inspect again, 0109), each opening to its groups. A requester with OFS requests sent gets the two
// lists of his own (no boxes). A row opens the item where it lives (Files, RFIs, Inspections).
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useOfsDesk } from '../../data/ofs';
import type { DeskRow } from '../../data/ofs.types';
import { formatInZone } from '../../lib/dates';
import { entityTarget } from '../../lib/entityTarget';
import { CLICK_BOX } from '../../ui/box';
import { ErrorState } from '../../ui/States';
import { useProjectZones } from '../board/zones';
import { DeskBoxes } from './DeskBoxes';
import { Expander } from './Expander';
import { deskLists, deskTitle, type DeskGroup } from './model';

interface RowProps {
  row: DeskRow;
  zone: string;
  onOpen: (row: DeskRow) => void;
}

function DeskLine({ row, zone, onOpen }: RowProps) {
  return (
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
}

interface ListProps {
  id: string;
  label: string;
  groups: readonly DeskGroup[];
  zone: string;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  onOpen: (row: DeskRow) => void;
}

function DeskList({ id, label, groups, zone, isOpen, toggle, onOpen }: ListProps) {
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <Expander id={id} label={label} count={count} open={isOpen(id)} onToggle={toggle}>
      {count === 0 ? <p className="px-1 text-sm text-ink-2">None.</p> : null}
      {groups.map((g) => (
        <Expander key={g.key} id={`${id}/${g.key}`} label={g.label} count={g.rows.length} open={isOpen(`${id}/${g.key}`)} onToggle={toggle} depth={1}>
          {g.rows.map((r) => (
            <DeskLine key={r.id} row={r} zone={zone} onOpen={onOpen} />
          ))}
        </Expander>
      ))}
    </Expander>
  );
}

export function OfsDesk({ projectId }: { projectId: string }) {
  const desk = useOfsDesk(projectId);
  const zoneOf = useProjectZones();
  const navigate = useNavigate();
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  if (desk.isError) return <ErrorState error={desk.error} title="The OFS start page did not load." onRetry={() => void desk.refetch()} />;
  // Nobody's start page (or still asking): the board as it was.
  if (!desk.data) return null;
  const lists = deskLists(desk.data.rows);
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
  const common = { zone: zoneOf(projectId), isOpen, toggle, onOpen: open };
  return (
    <section className="flex flex-col gap-3" data-testid="ofs-desk">
      {desk.data.designated ? <DeskBoxes projectId={projectId} /> : null}
      <DeskList id="waiting" label="Waiting on OFS" groups={lists.waiting} {...common} />
      <DeskList id="back" label="Back from OFS" groups={lists.back} {...common} />
    </section>
  );
}
