// The request picker's walls: grouped by level, any number, "All" per level. 44 px rows; names wrap, never cut.
import { useId } from 'react';
import { FIELD_LABEL } from '../../ui/Fields';
import type { LevelGroup } from './revPick';

interface RevWallsProps {
  groups: readonly LevelGroup[];
  picked: readonly string[];
  onToggle: (areaIds: string[], on: boolean) => void;
}

export function RevWalls({ groups, picked, onToggle }: RevWallsProps) {
  const set = new Set(picked);
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span id={labelId} className={FIELD_LABEL}>
          Walls
        </span>
        {picked.length > 0 ? (
          <span className="text-xs tabular-nums text-ink-2" data-testid="rev-walls-count">
            {picked.length}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line-strong bg-card shadow-control">
        {groups.map((g) => {
          const all = g.areas.every((a) => set.has(a.id));
          return (
            <div key={g.level} role="group" aria-label={g.level}>
              <div className="flex min-h-10 items-center justify-between gap-2 bg-card-head pl-3 pr-1">
                <span className="text-[13px] font-semibold text-ink">{g.level}</span>
                <button
                  type="button"
                  className="h-9 rounded-md px-3 text-[13px] font-medium text-accent hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => {
                    onToggle(
                      g.areas.map((a) => a.id),
                      !all,
                    );
                  }}
                >
                  {all ? 'None' : 'All'}
                </button>
              </div>
              <ul>
                {g.areas.map((a) => (
                  <li key={a.id} className="border-t border-line first:border-t-0">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-page/60">
                      <input
                        type="checkbox"
                        className="h-[18px] w-[18px] shrink-0 accent-accent"
                        checked={set.has(a.id)}
                        data-testid={`rev-wall-${a.id}`}
                        onChange={(e) => {
                          onToggle([a.id], e.target.checked);
                        }}
                      />
                      <span className="break-words">{a.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
