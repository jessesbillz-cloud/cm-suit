// Review (0113): the request being built, as the OFS requests Send will file (one per item and plan sheet page, the
// database's split), each with its walls and rooms (X takes one out), then the OFS form's own fields and Send. After
// Send, the batch it became. A page of its own: the main area on a desktop, its own screen on a phone.
import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useIrFormContext } from '../../../data/inspections.queries';
import { useCapability } from '../../../data/queries';
import type { Basket, Batch } from '../../../data/revs.basket';
import { useRevSetup } from '../../../data/revs.queries';
import { useRevRooms } from '../../../data/revs.rooms';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/Icon';
import { PageHeader } from '../../../ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../../ui/States';
import { TOOL_META } from '../../../ui/tools';
import { useOpenRequest } from '../../inspections/useInspectionsNav';
import { useRevsNav } from '../useRevsNav';
import { reviewGroups, type ReviewGroup } from './basketModel';
import { BasketSent } from './BasketSent';
import { ReviewGroups } from './ReviewGroups';
import { ReviewSend } from './ReviewSend';
import { useBasket } from './useBasket';

interface BasketReviewProps {
  projectId: string;
  isPhone: boolean;
}

/** The typed numbers in Send's order: null when they are not typed here, undefined when one is not a number. */
function typedNumbers(basket: Basket, groups: readonly ReviewGroup[], typed: Readonly<Record<string, string>>): number[] | null | undefined {
  if (!basket.may_number) return null;
  const out = groups.map((g) => Number(typed[g.key] ?? String(g.ofsNumber)));
  return out.every((n) => Number.isInteger(n) && n >= 1 && n <= 999999) ? out : undefined;
}

function Back({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      className="-ml-1 flex h-8 items-center gap-0.5 self-start text-sm font-medium text-accent"
      data-testid="basket-review-back"
      onClick={onBack}
    >
      <Icon icon={ChevronLeft} size={16} />
      Inspection cards
    </button>
  );
}

export function BasketReview({ projectId, isPhone }: BasketReviewProps) {
  const nav = useRevsNav(projectId, false);
  const basket = useBasket(projectId);
  const setup = useRevSetup(projectId);
  const rooms = useRevRooms(projectId);
  const ctx = useIrFormContext(projectId);
  const decide = useCapability(projectId, 'ir.decide');
  const open = useOpenRequest(projectId);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Batch | null>(null);

  let body: ReactNode;
  const failed = [basket.basket, setup, rooms, ctx, decide].find((q) => q.isError);
  if (sent) body = <BasketSent batch={sent} onOpen={open} onBack={() => { nav.close(); }} />;
  else if (failed) body = <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  else if (!basket.can) body = <EmptyState title="You don't file OFS requests on this job." />;
  else if (!basket.basket.data || !setup.data || !rooms.data || !ctx.data || decide.data === undefined) body = <LoadingState label="Loading the request" />;
  else if (basket.basket.data.groups.length === 0) body = <EmptyState title="Nothing in the request yet." />;
  else {
    const data = basket.basket.data;
    const groups = reviewGroups(data, setup.data, rooms.data);
    body = (
      <div className="flex flex-col gap-4">
        <ReviewGroups
          groups={groups}
          numbers={data.may_number ? typed : null}
          busy={basket.busy}
          onNumber={(key, value) => {
            setTyped((t) => ({ ...t, [key]: value }));
          }}
          onRemove={(areaId, itemId) => {
            basket.toggle(areaId, itemId);
          }}
        />
        <ReviewSend
          projectId={projectId}
          version={data.version}
          ctx={ctx.data}
          inspector={decide.data}
          ofsNumbers={typedNumbers(data, groups, typed)}
          onSent={setSent}
        />
      </div>
    );
  }
  const n = basket.basket.data?.groups.length ?? 0;
  const head = (
    <PageHeader
      title="Request"
      icon={TOOL_META.revs.icon}
      meta={sent || n === 0 ? undefined : <span data-testid="basket-meta">{n === 1 ? '1 OFS request' : `${String(n)} OFS requests · one batch`}</span>}
    />
  );
  if (isPhone) {
    return (
      <div className="flex flex-col gap-2 px-4 pt-3" data-testid="basket-review">
        {head}
        {body}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="basket-review">
      <Back onBack={() => { nav.close(); }} />
      {head}
      <Card>{body}</Card>
    </div>
  );
}
