// After Send (0113): the batch the request became, one line per OFS request (its OFS number, its IR number, what it
// asks for), each opening in Inspections, and the way back to the cards.
import { ArrowLeft } from 'lucide-react';
import type { Batch } from '../../../data/revs.basket';
import { CLICK_BOX } from '../../../ui/box';
import { Button } from '../../../ui/Button';
import { SECTION_HEAD } from '../../../ui/PageHeader';

interface BasketSentProps {
  batch: Batch;
  onOpen: (requestId: string) => void;
  onBack: () => void;
}

const pad = (n: number | null) => (n === null ? '' : `OFS ${String(n).padStart(4, '0')} · `);

export function BasketSent({ batch, onOpen, onBack }: BasketSentProps) {
  const n = batch.requests.length;
  return (
    <div className="flex flex-col gap-3" data-testid="basket-sent" data-count={n}>
      <h2 className={SECTION_HEAD}>{n === 1 ? 'Sent' : `Sent · Batch of ${String(n)}`}</h2>
      <ul className="flex flex-col gap-2">
        {batch.requests.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2.5 text-left ${CLICK_BOX}`}
              data-testid="basket-sent-request"
              onClick={() => {
                onOpen(r.id);
              }}
            >
              <span className="text-[13px] font-semibold tabular-nums text-ink">{`${pad(r.ofs_number)}IR ${String(r.number)}`}</span>
              <span className="break-words text-[13px] text-ink-2 wrap-anywhere">{r.items}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button icon={ArrowLeft} size="lg" className="self-start" data-testid="basket-back" onClick={onBack}>
        Inspection cards
      </Button>
    </div>
  );
}
