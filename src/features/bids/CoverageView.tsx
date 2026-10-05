// Coverage board (SPEC §11.6): one row per package with invited / bidding / declined / submitted / late.
// A row opens that package's invites on the right; "Invite" opens the invite form there. A job with no packages yet
// offers Add package (the first step) instead.
import { Plus, Send } from 'lucide-react';
import { useBidCoverage } from '../../data/bids.queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { TOOL_META } from '../../ui/tools';
import { OPEN_BAR, ROW_HOVER, ROW_OPEN, TH } from './rowStyles';

interface CoverageViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onInvite: () => void;
  /** The first step on a new job: no packages yet. */
  onAddPackage: () => void;
}

const COLS = ['Invited', 'Bidding', 'Declined', 'Submitted', 'Late'];

/** A count cell: zero stays quiet. */
function Count({ n }: { n: number }) {
  return <td className={`px-2 py-3 text-right tabular-nums ${n > 0 ? 'font-medium text-ink' : 'text-ink-3'}`}>{n}</td>;
}

export function CoverageView({ projectId, selectedId, onOpen, onInvite, onAddPackage }: CoverageViewProps) {
  const coverage = useBidCoverage(projectId);
  const none = coverage.data?.length === 0;
  const invite = none ? undefined : (
    <Button size="sm" variant="primary" icon={Send} data-testid="bids-invite" onClick={onInvite}>
      Invite
    </Button>
  );
  const addPackage = (
    <Button variant="primary" icon={Plus} data-testid="coverage-add-package" onClick={onAddPackage}>
      Add package
    </Button>
  );

  return (
    <Card actions={invite} padded={false}>
      {coverage.isPending ? <LoadingState label="Loading coverage" /> : null}
      {coverage.isError ? <ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} /> : null}
      {none ? <EmptyState title="No packages yet." icon={TOOL_META.bids.icon} action={addPackage} /> : null}
      {coverage.data && coverage.data.length > 0 ? (
        // A phone scrolls the board sideways inside the card rather than cutting columns off.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm" data-testid="coverage-board">
            <thead>
              <tr className={`border-b border-line text-left ${TH}`}>
                <th className="w-16 py-2.5 pl-4 pr-2 font-medium">Code</th>
                <th className="px-2 py-2.5 font-medium">Package</th>
                {COLS.map((c) => (
                  <th key={c} className="w-24 px-2 py-2.5 text-right font-medium last:pr-4">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.data.map((r) => {
                const open = r.package_id === selectedId;
                return (
                  <tr
                    key={r.package_id}
                    data-testid={`coverage-row-${r.code}`}
                    className={`h-[52px] border-b border-line last:border-b-0 ${open ? ROW_OPEN : ROW_HOVER}`}
                    onClick={() => {
                      onOpen(r.package_id);
                    }}
                  >
                    <td className={`py-3 pl-4 pr-2 font-medium tabular-nums text-ink-2 ${open ? OPEN_BAR : ''}`}>{r.code}</td>
                    <td className="px-2 py-3 text-ink">
                      <button type="button" className="wrap-anywhere text-left font-medium">
                        {r.name}
                      </button>
                    </td>
                    <Count n={r.invited} />
                    <Count n={r.intends} />
                    <Count n={r.declined} />
                    <Count n={r.submitted} />
                    <td className="py-3 pl-2 pr-4 text-right">{r.late > 0 ? <StatusChip status="postponed" label={String(r.late)} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
