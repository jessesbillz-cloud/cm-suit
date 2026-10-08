// The one row of level chips under the views (Jesse, Oct 6: "Level one, Level two, Level three, Site"): every level of
// the job, then All (not on the plan: a plan is one level). The URL holds the choice (useRevsNav setLevel).
import { ChipPick } from '../../ui/ChipPick';
import { ALL_LEVELS } from './levels';

interface LevelChipsProps {
  levels: readonly string[];
  /** The level shown; null = All. */
  level: string | null;
  withAll: boolean;
  onLevel: (level: string) => void;
}

export function LevelChips({ levels, level, withAll, onLevel }: LevelChipsProps) {
  if (levels.length === 0) return null;
  const chips = [...levels.map((l) => ({ value: l, label: l })), ...(withAll ? [{ value: ALL_LEVELS, label: 'All' }] : [])];
  return (
    <ChipPick
      label="Level"
      chips={chips}
      picked={[level ?? ALL_LEVELS]}
      onChange={(picked) => {
        // A tap on the level already shown keeps it.
        if (picked[0] !== undefined) onLevel(picked[0]);
      }}
      testId="rev-level"
    />
  );
}
