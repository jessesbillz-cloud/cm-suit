// Dropped files whose name gave no package: one select per file. Picking a package starts that file at once.
import type { PackageRow } from '../../data/bids.types';
import { SelectField } from '../../ui/Fields';
import type { PendingPick } from './useIntake';

interface IntakePicksProps {
  picks: readonly PendingPick[];
  packages: readonly PackageRow[];
  onPick: (key: string, packageId: string) => void;
}

export function IntakePicks({ picks, packages, onPick }: IntakePicksProps) {
  if (picks.length === 0) return null;
  const options = [{ value: '', label: 'Pick a package' }, ...packages.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))];
  return (
    <ul className="divide-y divide-line border-b border-line" data-testid="intake-picks">
      {picks.map((p) => (
        <li key={p.key} className="px-4 py-2">
          <SelectField
            label={p.name}
            value=""
            options={options}
            testId={`intake-pick-${p.name}`}
            onChange={(v) => {
              if (v !== '') onPick(p.key, v);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
