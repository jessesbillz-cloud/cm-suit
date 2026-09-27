// Money from a bid (SPEC §11.6): base amount with its evidence and page, then alternates. Only for pricing roles:
// RLS returns nothing otherwise, and an aal1 session gets the step-up prompt in place of the money.
import { useBidPricing, usePricingAccess } from '../../data/bids.queries';
import { formatMoney } from '../../lib/format';
import { ErrorState, LoadingState } from '../../ui/States';
import { StepUp } from '../auth/StepUp';

interface PricingLinesProps {
  projectId: string;
  extractionId: string;
}

function Amount({ amount, evidence, page }: { amount: number | null; evidence: string | null; page: number | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="font-semibold tabular-nums text-ink">{amount !== null ? formatMoney(amount) : '-'}</span>
      {page !== null ? <span className="ml-2 text-xs text-ink-2">p. {page}</span> : null}
      {evidence ? <q className="block break-words text-xs text-ink-2">{evidence}</q> : null}
    </span>
  );
}

export function PricingLines({ projectId, extractionId }: PricingLinesProps) {
  const access = usePricingAccess(projectId);
  const pricing = useBidPricing(projectId, extractionId, access.data === 'yes');

  if (access.isError) return <ErrorState error={access.error} onRetry={() => void access.refetch()} />;
  if (access.data === 'two_factor') return <StepUp />;
  if (access.data !== 'yes') return null;
  if (pricing.isPending) return <LoadingState label="Loading pricing" />;
  if (pricing.isError) return <ErrorState error={pricing.error} onRetry={() => void pricing.refetch()} />;
  if (pricing.data === null) return <p className="text-sm text-ink-2">No pricing found.</p>;

  const p = pricing.data;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="bid-pricing">
      <div className="flex gap-2">
        <span className="w-24 shrink-0 text-xs text-ink-2">Base</span>
        <Amount amount={p.base_amount} evidence={p.base_evidence} page={p.base_page} />
      </div>
      {p.alternates.map((a, i) => (
        <div key={`${String(i)}-${a.label}`} className="flex gap-2">
          <span className="w-24 shrink-0 break-words text-xs text-ink-2">{a.label || 'Alternate'}</span>
          <Amount amount={a.amount} evidence={a.evidence} page={a.page} />
        </div>
      ))}
    </div>
  );
}
