// Coverage board (SPEC §11.6): one row per package with invited / bidding / declined / submitted / late.
// A row opens that package's invites on the right; "Invite" opens the invite form there.
import { Send } from 'lucide-react';
import { useBidCoverage } from '../../data/bids.queries';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { INVITE_ITEM } from './model';

interface CoverageViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

const COLS = ['Invited', 'Bidding', 'Declined', 'Submitted', 'Late'];

export function CoverageView({ projectId, selectedId, onOpen }: CoverageViewProps) {
  const coverage = useBidCoverage(projectId);
  const invite = (
    <Button size="sm" variant="primary" icon={Send} data-testid="bids-invite" onClick={() => {
        onOpen(INVITE_ITEM);
      }}
    >
      Invite
    </Button>
  );

  return (
    <Card actions={invite} padded={false}>
      {coverage.isPending ? <LoadingState label="Loading coverage" /> : null}
      {coverage.isError ? <ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} /> : null}
      {coverage.data?.length === 0 ? <EmptyState title="No packages yet." /> : null}
      {coverage.data && coverage.data.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-testid="coverage-board">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-2">
              <th className="w-14 px-4 py-2 font-medium">Code</th>
              <th className="px-2 py-2 font-medium">Package</th>
              {COLS.map((c) => (
                <th key={c} className="w-20 px-2 py-2 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coverage.data.map((r) => (
              <tr
                key={r.package_id}
                data-testid={`coverage-row-${r.code}`}
                className={`cursor-pointer border-b border-line align-top ${r.package_id === selectedId ? 'bg-accent-soft' : 'hover:bg-page'}`}
                onClick={() => {
                  onOpen(r.package_id);
                }}
              >
                <td className="px-4 py-2 tabular-nums text-ink-2">{r.code}</td>
                <td className="whitespace-normal break-words px-2 py-2 text-ink">
                  <button type="button" className="text-left">
                    {r.name}
                  </button>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.invited}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.intends}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.declined}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.submitted}</td>
                <td className="px-2 py-2 text-right">{r.late > 0 ? <StatusChip status="postponed" label={String(r.late)} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Card>
  );
}
