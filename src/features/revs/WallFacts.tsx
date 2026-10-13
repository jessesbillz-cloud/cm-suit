// The shown item's facts in one short line under the drawing: "Passed · IR 377 · OFS 0065 · Oct 2" (the IR opens the
// request in Inspections), "Failed: why" in red, "Requested · IR 380", "Open", "N/A", and who does it. A manager switches
// an open item off for this wall only ("Not needed here", 0101 rev_card_item) or back on, at once; the toast offers Undo
// (no "are you sure"). An item with a sign-off, a request or a failure stays as it is. An item signed off before the
// app (0082) is "Done · OFS #0041 · Sep 21" with its note; a manager signs one off before (the form opens over the
// items) or clears it.
import { messageOf } from '../../data/errors';
import { useCardItem } from '../../data/revs.card';
import type { RevArea } from '../../data/revs.types';
import { useToast } from '../../ui/Toast';
import { beforeLine, canSignBefore, cardSwitch, chipOf, irLine, signedBefore } from './model';
import type { WallItem } from './wallPage';

interface WallFactsProps {
  projectId: string;
  area: RevArea;
  /** The shown item, or null for a part no item names (its own name is on the drawing). */
  shown: WallItem | null;
  timeZone: string;
  canManage: boolean;
  onOpenRequest: (requestId: string) => void;
  /** May I open that request (rev_wall_history's can_open)? Else its line is plain text, not a link to nowhere. */
  canOpen: (requestId: string) => boolean;
  /** A manager: sign the shown item off before the app, or clear that. */
  onSignBefore?: ((item: WallItem) => void) | undefined;
  onClearBefore?: ((item: WallItem) => void) | undefined;
}

const LINK = '-my-1 min-h-8 shrink-0 rounded-md px-2 text-[13px] font-medium text-accent hover:bg-accent-soft disabled:text-ink-3/50';

function CardSwitch({ projectId, area, shown }: { projectId: string; area: RevArea; shown: WallItem }) {
  const item = useCardItem();
  const toast = useToast();
  const to = cardSwitch(shown.cell.status);
  if (!to) return null;
  const v = { projectId, areaId: area.id, itemId: shown.item.id };
  const name = shown.item.name;
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const set = (on: boolean) => {
    item.mutate(
      { ...v, on },
      {
        onSuccess: () => {
          toast.show({
            message: on ? `${name}: needed here.` : `${name}: not needed here.`,
            // mutateAsync settles even if this wall has closed meanwhile.
            action: { label: 'Undo', onClick: () => { void item.mutateAsync({ ...v, on: !on }).catch(failed); } },
          });
        },
        onError: failed,
      },
    );
  };
  return (
    <button
      type="button"
      className={LINK}
      disabled={item.isPending}
      data-testid="rev-na"
      onClick={() => {
        set(to === 'on');
      }}
    >
      {to === 'on' ? 'Needed here' : 'Not needed here'}
    </button>
  );
}

export function WallFacts({ projectId, area, shown, timeZone, canManage, onOpenRequest, canOpen, onSignBefore, onClearBefore }: WallFactsProps) {
  if (!shown) return <div className="min-h-8" data-testid="rev-facts" />;
  const { cell, item } = shown;
  const chip = chipOf(cell.status);
  const ir = irLine(cell, timeZone);
  const requestId = cell.request_id;
  const failed = cell.status === 'failed';
  const why = failed && cell.note ? cell.note : null;
  const before = signedBefore(cell);
  const signed = beforeLine(cell, timeZone);
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] leading-5" data-testid="rev-facts" data-status={cell.status}>
      <span className="font-semibold" style={{ color: `var(--status-${chip.key}-fg)` }}>
        {why ? 'Failed:' : before ? 'Done' : chip.label}
      </span>
      {signed !== null ? (
        <>
          <Dot />
          <span className="font-medium tabular-nums text-ink-2" data-testid="rev-before-line">
            {signed}
          </span>
        </>
      ) : null}
      {before && cell.note ? (
        <>
          <Dot />
          <span className="min-w-0 break-words text-ink-2">{cell.note}</span>
        </>
      ) : null}
      {why ? (
        <span className="min-w-0 break-words text-danger" data-testid="rev-item-note">
          {why}
        </span>
      ) : null}
      {ir !== null && requestId !== null ? (
        <>
          <Dot />
          {canOpen(requestId) ? (
            <button
              type="button"
              className="font-medium tabular-nums text-accent hover:underline"
              data-testid="rev-ir-link"
              onClick={() => {
                onOpenRequest(requestId);
              }}
            >
              {ir}
            </button>
          ) : (
            <span className="font-medium tabular-nums text-ink-2" data-testid="rev-ir-line">
              {ir}
            </span>
          )}
        </>
      ) : null}
      {item.company ? (
        <>
          <Dot />
          <span className="break-words text-ink-3">{item.company}</span>
        </>
      ) : null}
      {canManage ? (
        <span className="ml-auto flex shrink-0 items-center">
          {before && onClearBefore ? (
            <button type="button" className={LINK} data-testid="rev-before-clear" onClick={() => { onClearBefore(shown); }}>
              Clear
            </button>
          ) : null}
          {canSignBefore(cell.status) && onSignBefore ? (
            <button type="button" className={LINK} data-testid="rev-before" onClick={() => { onSignBefore(shown); }}>
              Signed off before
            </button>
          ) : null}
          <CardSwitch key={item.id} projectId={projectId} area={area} shown={shown} />
        </span>
      ) : null}
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-ink-3">
      ·
    </span>
  );
}
