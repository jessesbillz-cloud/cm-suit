// Summary (SPEC §11.6 "summary: low per package, spread, sum of lows, flag count"): one row per package, the sum
// of lows at the bottom. A row opens that package's leveling grid. Money columns exist only with pricing access.
import { useBidPackages, usePricingAccess } from '../../data/bids.queries';
import type { PricingAccess } from '../../data/bids.types';
import { useBidFlags, useLevelingBoard } from '../../data/leveling.queries';
import { formatMoney } from '../../lib/format';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { flagChip, formatPct, pwLabel, SPREAD_WARN, sumOfLows, summarize, type PackageSummary } from './leveling';
import { StepUp } from '../auth/StepUp';
import { ROW_HOVER, TH as HEAD } from './rowStyles';

interface SummaryViewProps {
  projectId: string;
  onOpenPackage: (packageId: string) => void;
}

const TH = 'px-2 py-2.5 font-medium';

function Flags({ s }: { s: PackageSummary }) {
  if (s.flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {s.flags.map((f, i) => {
        const chip = flagChip(f);
        return <StatusChip key={`${f.kind}-${String(i)}`} status={chip.status} label={chip.label} />;
      })}
    </span>
  );
}

function MoneyCells({ s }: { s: PackageSummary }) {
  // No low: no bids, or none priced yet ("No bids" already sits in the Bids column).
  if (s.low === null) {
    return (
      <td className="px-2 py-3 text-ink-3" colSpan={5}>
        -
      </td>
    );
  }
  const spread = s.spread;
  return (
    <>
      <td className="px-2 py-3 text-right font-semibold tabular-nums text-ink">{formatMoney(s.low.base_amount ?? 0)}</td>
      <td className="whitespace-normal break-words px-2 py-3 text-ink">{s.low.bidder}</td>
      <td className="px-2 py-3">{pwLabel(s.low.prevailing_wage)}</td>
      <td className="px-2 py-3 text-right tabular-nums">{s.high === null ? '-' : formatMoney(s.high)}</td>
      <td className={`px-2 py-3 text-right tabular-nums ${spread !== null && spread > SPREAD_WARN ? 'font-semibold text-danger' : ''}`}>
        {spread === null ? '-' : formatPct(spread)}
      </td>
    </>
  );
}

interface TableProps {
  summaries: PackageSummary[];
  access: PricingAccess | undefined;
  onOpenPackage: (packageId: string) => void;
}

function SummaryTable({ summaries, access, onOpenPackage }: TableProps) {
  const money = access === 'yes';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="bid-summary">
        <thead>
          <tr className={`border-b border-line text-left ${HEAD}`}>
            <th className={`${TH} w-14 pl-4`}>Code</th>
            <th className={TH}>Package</th>
            <th className={`${TH} w-12 text-right`}>Bids</th>
            {money ? (
              <>
                <th className={`${TH} w-28 text-right`}>Low</th>
                <th className={TH}>Low bidder</th>
                <th className={`${TH} w-20`}>PW</th>
                <th className={`${TH} w-28 text-right`}>High</th>
                <th className={`${TH} w-20 text-right`}>Spread</th>
              </>
            ) : null}
            <th className={`${TH} pr-4`}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr
              key={s.id}
              data-testid={`summary-row-${s.code}`}
              className={`h-[52px] border-b border-line align-top ${ROW_HOVER}`}
              onClick={() => {
                onOpenPackage(s.id);
              }}
            >
              <td className="py-3 pl-4 pr-2 font-medium tabular-nums text-ink-2">{s.code}</td>
              <td className="whitespace-normal break-words px-2 py-3 font-medium text-ink">{s.name}</td>
              <td data-testid={`summary-bids-${s.code}`} className={`whitespace-nowrap px-2 py-3 text-right tabular-nums ${s.bids === 0 ? 'font-semibold text-danger' : ''}`}>
                {s.bids === 0 ? 'No bids' : s.bids}
              </td>
              {money ? <MoneyCells s={s} /> : null}
              <td className="py-3 pl-2 pr-4">
                <Flags s={s} />
              </td>
            </tr>
          ))}
        </tbody>
        {money ? (
          <tfoot>
            <tr className="text-sm">
              <td className="py-3 pl-4 pr-2" colSpan={3} />
              <td className="px-2 py-3 text-right font-semibold tabular-nums text-ink" data-testid="summary-sum-of-lows">
                {formatMoney(sumOfLows(summaries))}
              </td>
              <td className="px-2 py-3 text-ink-2" colSpan={5}>
                Sum of lows
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function SummaryView({ projectId, onOpenPackage }: SummaryViewProps) {
  const packages = useBidPackages(projectId);
  const board = useLevelingBoard(projectId, true);
  const flags = useBidFlags(projectId, true);
  const access = usePricingAccess(projectId);

  return (
    <Card padded={false}>
      {packages.isPending || board.isPending || flags.isPending ? <LoadingState label="Loading summary" /> : null}
      {packages.isError ? <ErrorState error={packages.error} onRetry={() => void packages.refetch()} /> : null}
      {board.isError ? <ErrorState error={board.error} onRetry={() => void board.refetch()} /> : null}
      {flags.isError ? <ErrorState error={flags.error} onRetry={() => void flags.refetch()} /> : null}
      {access.isError ? <ErrorState error={access.error} onRetry={() => void access.refetch()} /> : null}
      {packages.data?.length === 0 ? <EmptyState title="No packages yet." icon={TOOL_META.bids.icon} /> : null}
      {access.data === 'two_factor' ? (
        <div className="px-4 pt-3">
          <StepUp />
        </div>
      ) : null}
      {packages.data && packages.data.length > 0 && board.data && flags.data ? (
        <SummaryTable summaries={summarize(packages.data, board.data, flags.data)} access={access.data} onOpenPackage={onOpenPackage} />
      ) : null}
    </Card>
  );
}
