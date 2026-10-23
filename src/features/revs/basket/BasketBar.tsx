// The slim bar at the bottom of every Inspection cards screen while a request is being built (0113): what is in it
// ("Request · 9 items on 6 walls") and Review, in thumb reach on a phone. Hidden when it is empty.
import { ArrowRight } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { barLine } from './basketModel';
import type { BasketApi } from './useBasket';

interface BasketBarProps {
  basket: BasketApi;
  onReview: () => void;
  /** Runs edge to edge under a phone screen's side gutters. */
  isPhone: boolean;
}

export function BasketBar({ basket, onReview, isPhone }: BasketBarProps) {
  if (!basket.can || basket.cells.length === 0) return null;
  return (
    <div
      className={`sticky bottom-0 z-20 flex items-center gap-3 border-t-2 border-ink bg-card py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_-12px_rgba(16,24,40,.35)] ${
        isPhone ? '-mx-4 px-4' : 'px-4'
      }`}
      data-testid="basket-bar"
      data-count={basket.cells.length}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="heading text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">Request</span>
        <span className="break-words text-[15px] font-semibold text-ink" data-testid="basket-line">
          {barLine(basket.cells)}
        </span>
      </span>
      <Button variant="primary" size="lg" icon={ArrowRight} data-testid="basket-review" onClick={onReview}>
        Review
      </Button>
    </div>
  );
}
