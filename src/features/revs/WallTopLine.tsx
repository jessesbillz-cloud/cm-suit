// A wall page's one compact line over its drawing (Jesse, Oct 23: the 3-D wall front and center): its name, the grid or
// room in brackets beside it, its tag, and its tally as a slim bar with "12 of 21 passed"; a manager's Edit / Remove at
// the end. A wall added on the spot and not checked yet (0113) says so to a manager, with Confirm (Edit and Remove do
// the same, with Undo).
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { RevArea } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { calloutOf, type WallCount } from './wallPage';
import { WallProgress } from './WallProgress';

interface WallTopLineProps {
  area: RevArea;
  count: WallCount;
  /** A manager's Edit / Remove. */
  manage: ReactNode;
}

export function WallTopLine({ area, count, manage }: WallTopLineProps) {
  const { title, sub } = calloutOf(area.name, area.wall_tag);
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="rev-wall-top">
      <h1 className="heading min-w-0 break-words text-[22px] font-semibold leading-7 text-ink sm:text-[24px]" data-testid="rev-wall-name">
        {title}
        {sub ? (
          <>
            {' '}
            <span className="ml-1 inline-block text-[15px] font-medium normal-case tracking-normal text-ink-2">{sub}</span>
          </>
        ) : null}
      </h1>
      {area.wall_tag ? (
        <span className="shrink-0 rounded border-[1.5px] border-ink px-1.5 text-[13px] font-semibold leading-5 text-ink" data-testid="rev-wall-tag-top">
          {area.wall_tag}
        </span>
      ) : null}
      <div className="min-w-[10rem] flex-1">
        <WallProgress count={count} withLine testId="rev-wall-progress" />
      </div>
      {manage}
    </header>
  );
}

interface FieldCheckProps {
  /** Who added it (the job's people list). */
  by: string;
  busy: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

/** A manager's check of a wall added on the spot: who added it, Confirm, Edit, Remove. */
export function FieldCheck({ by, busy, onConfirm, onEdit, onRemove }: FieldCheckProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border-[1.5px] border-dashed border-ink px-3 py-2" data-testid="rev-field-check">
      <span className="min-w-0 flex-1 break-words text-[13.5px] font-medium text-ink">{`Added by ${by} — needs check`}</span>
      <Button size="sm" variant="primary" icon={Check} disabled={busy} data-testid="rev-field-confirm" onClick={onConfirm}>
        Confirm
      </Button>
      <Button size="sm" disabled={busy} data-testid="rev-field-edit" onClick={onEdit}>
        Edit
      </Button>
      <Button size="sm" variant="danger" disabled={busy} data-testid="rev-field-remove" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
