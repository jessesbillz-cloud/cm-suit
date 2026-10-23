// One branch of the fire marshal's list (Waiting, Approved or Not approved): Submittals by spec section, then RFIs by
// number. A row opens the item beside the list.
import type { OfsReviewRow } from '../../data/ofs.types';
import { formatInZone } from '../../lib/dates';
import { CLICK_BOX, FOCUS_RING } from '../../ui/box';
import { Expander } from './Expander';
import { rowTitle, type Branch } from './model';

interface Opened {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
}

interface BranchProps extends Opened {
  /** The branch's own id ("waiting", "approved", "not_approved"). */
  id: string;
  branch: Branch;
  zone: string;
  selectedId: string | null;
  /** The depth of the branch's own groups. */
  depth: number;
  onOpen: (row: OfsReviewRow) => void;
}

interface RowProps {
  row: OfsReviewRow;
  zone: string;
  selected: boolean;
  onOpen: (row: OfsReviewRow) => void;
}

function ReviewRow({ row, zone, selected, onOpen }: RowProps) {
  const at = row.decided_at ?? row.sent_at;
  return (
    <button
      type="button"
      data-testid="ofs-row"
      data-kind={row.kind}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left ${
        selected ? `border border-accent bg-accent-soft shadow-tile ${FOCUS_RING}` : CLICK_BOX
      }`}
      onClick={() => {
        onOpen(row);
      }}
    >
      <span className="break-words text-sm font-medium text-ink wrap-anywhere">{rowTitle(row)}</span>
      <span className="text-xs text-ink-2">{formatInZone(at, zone, 'MMM d, yyyy')}</span>
    </button>
  );
}

export function ReviewBranch({ id, branch, zone, selectedId, depth, onOpen, isOpen, toggle }: BranchProps) {
  const subs = branch.submittals.reduce((n, g) => n + g.rows.length, 0);
  const row = (r: OfsReviewRow) => <ReviewRow key={r.id} row={r} zone={zone} selected={r.id === selectedId} onOpen={onOpen} />;
  return (
    <>
      {subs > 0 ? (
        <Expander id={`${id}/submittals`} label="Submittals" count={subs} open={isOpen(`${id}/submittals`)} onToggle={toggle} depth={depth}>
          {branch.submittals.map((g) => {
            const gid = `${id}/submittals/${g.key || 'none'}`;
            return (
              <Expander key={gid} id={gid} label={g.label} count={g.rows.length} open={isOpen(gid)} onToggle={toggle} depth={depth + 1}>
                {g.rows.map(row)}
              </Expander>
            );
          })}
        </Expander>
      ) : null}
      {branch.rfis.length > 0 ? (
        <Expander id={`${id}/rfis`} label="RFIs" count={branch.rfis.length} open={isOpen(`${id}/rfis`)} onToggle={toggle} depth={depth}>
          {branch.rfis.map(row)}
        </Expander>
      ) : null}
    </>
  );
}
