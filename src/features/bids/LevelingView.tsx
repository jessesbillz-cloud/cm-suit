// Leveling (SPEC §11.6): pick a package on the left, see its grid on the right. One board query and one flags
// query for the whole job; the package pick is in the URL (?pkg=) so a summary row can land here.
import { useBidPackages, usePricingAccess } from '../../data/bids.queries';
import type { FlagRow, LevelingRow, PackageRow } from '../../data/bids.types';
import { useBidFlags, useLevelingBoard } from '../../data/leveling.queries';
import { Card } from '../../ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { flagChip, indexFlags, lowBid } from './leveling';
import { LevelingGrid } from './LevelingGrid';
import { PackagePicker } from './PackagePicker';
import { StepUp } from '../auth/StepUp';

interface LevelingViewProps {
  projectId: string;
  selectedId: string | null;
  onOpen: (id: string) => void;
  packageId: string | null;
  onPickPackage: (packageId: string) => void;
}

interface LoadedProps {
  projectId: string;
  packages: PackageRow[];
  rows: LevelingRow[];
  flags: FlagRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  packageId: string | null;
  onPickPackage: (packageId: string) => void;
}

function Loaded({ projectId, packages, rows, flags, selectedId, onOpen, packageId, onPickPackage }: LoadedProps) {
  const access = usePricingAccess(projectId);
  const sorted = [...packages].sort((a, b) => a.code.localeCompare(b.code));
  const picked = sorted.find((p) => p.id === packageId) ?? sorted[0];
  const { byRow, byPackage } = indexFlags(flags);
  const counts = new Map<string, number>();
  for (const r of rows) if (r.state === 'current') counts.set(r.package_id, (counts.get(r.package_id) ?? 0) + 1);
  const flagged = new Set(flags.map((f) => f.package_id));

  if (!picked) {
    return (
      <Card>
        <EmptyState title="No packages yet." />
      </Card>
    );
  }
  const mine = rows.filter((r) => r.package_id === picked.id);
  const money = access.data === 'yes';
  const title = (
    <span className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums text-ink-2">{picked.code}</span>
      <span>{picked.name}</span>
      {(byPackage.get(picked.id) ?? []).map((f) => {
        const chip = flagChip(f);
        return <StatusChip key={f.kind} status={chip.status} label={chip.label} />;
      })}
    </span>
  );

  return (
    <div className="flex items-start gap-3">
      <Card padded={false} className="w-60 shrink-0">
        <PackagePicker packages={sorted} counts={counts} flagged={flagged} selectedId={picked.id} onPick={onPickPackage} />
      </Card>
      <Card padded={false} className="min-w-0 flex-1" title={title}>
        {access.isError ? <ErrorState error={access.error} onRetry={() => void access.refetch()} /> : null}
        {access.data === 'two_factor' ? (
          <div className="px-4 pt-3">
            <StepUp />
          </div>
        ) : null}
        {mine.length === 0 ? (
          <EmptyState title="No bids in this package." />
        ) : (
          <LevelingGrid rows={mine} byRow={byRow} money={money} lowId={money ? (lowBid(mine)?.submission_id ?? null) : null} selectedId={selectedId} onOpen={onOpen} />
        )}
      </Card>
    </div>
  );
}

export function LevelingView({ projectId, selectedId, onOpen, packageId, onPickPackage }: LevelingViewProps) {
  const packages = useBidPackages(projectId);
  const board = useLevelingBoard(projectId, true);
  const flags = useBidFlags(projectId, true);

  if (packages.isPending || board.isPending || flags.isPending) return <LoadingState label="Loading leveling" />;
  if (packages.isError) return <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />;
  if (board.isError) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;
  if (flags.isError) return <ErrorState error={flags.error} onRetry={() => void flags.refetch()} />;
  return (
    <Loaded
      projectId={projectId}
      packages={packages.data}
      rows={board.data}
      flags={flags.data}
      selectedId={selectedId}
      onOpen={onOpen}
      packageId={packageId}
      onPickPackage={onPickPackage}
    />
  );
}
