// The package list beside the leveling grid: code, name (wraps), how many bids stand, a red dot when flagged.
import type { PackageRow } from '../../data/bids.types';

interface PackagePickerProps {
  packages: readonly PackageRow[];
  /** Current comparable bids per package id. */
  counts: ReadonlyMap<string, number>;
  flagged: ReadonlySet<string>;
  selectedId: string | null;
  onPick: (packageId: string) => void;
}

export function PackagePicker({ packages, counts, flagged, selectedId, onPick }: PackagePickerProps) {
  return (
    <ul className="divide-y divide-line" aria-label="Packages">
      {packages.map((p) => {
        const selected = p.id === selectedId;
        return (
          <li key={p.id}>
            <button
              type="button"
              data-testid={`leveling-pkg-${p.code}`}
              aria-current={selected ? 'true' : undefined}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${selected ? 'bg-accent-soft' : 'hover:bg-page'}`}
              onClick={() => {
                onPick(p.id);
              }}
            >
              <span className="w-9 shrink-0 tabular-nums text-ink-2">{p.code}</span>
              <span className="min-w-0 flex-1 whitespace-normal break-words text-ink">{p.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {flagged.has(p.id) ? <span aria-label="Flagged" className="h-2 w-2 rounded-full bg-danger" /> : null}
                <span className="w-4 text-right tabular-nums text-xs text-ink-2">{counts.get(p.id) ?? 0}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
