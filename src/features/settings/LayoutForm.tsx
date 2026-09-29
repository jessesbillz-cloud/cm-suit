// Settings > Layout: the rail (which tools, in what order), where the main area opens, what the right column holds,
// and the "What's new" line (SPEC §7.2). A live sketch shows where each choice lands. Each change saves at once.
// The rail starts as my position's tools (0040); any change pins my own list, and "Use recommended" goes back.
import { useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { DOCKED_PANELS, RAIL_TOOLS, type LayoutChoices, type RailTool } from '../../lib/layout';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { CheckField, SelectField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { LayoutPreview, pointAt, type Spot } from './LayoutPreview';
import { LayoutTips } from './LayoutTips';
import { RailPicker } from './RailPicker';
import { FIELD_ROW, SettingRow } from './SettingRow';
import { useLayoutEditor } from './useLayoutEditor';
import { useRecommendedRail } from './useRecommendedRail';

type Docked = LayoutChoices['docked_panel'];

const DOCKED_LABELS: Record<Docked, string> = { board: 'Board', none: 'Open item only' };

function DockedChoice({ value, onPick }: { value: Docked; onPick: (v: Docked) => void }) {
  return (
    <div role="radiogroup" aria-label="Right column" className="inline-flex self-start rounded-lg border border-line bg-card p-0.5 shadow-control">
      {DOCKED_PANELS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={d === value}
          data-testid={`layout-docked-${d}`}
          className={`h-8 rounded-md px-3.5 text-sm ${d === value ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
          onClick={() => {
            onPick(d);
          }}
        >
          {DOCKED_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

function Group({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** Beside "Rail": that it is my position's list, or the way back to it once I've pinned my own. */
function RailState({ pinned, onReset }: { pinned: boolean; onReset: () => void }) {
  if (!pinned) {
    return (
      <span data-testid="layout-rail-recommended" className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
        Recommended
      </span>
    );
  }
  return (
    <Button size="sm" variant="quiet" icon={RotateCcw} data-testid="layout-rail-use-recommended" onClick={onReset}>
      Use recommended
    </Button>
  );
}

interface ChoicesProps {
  c: LayoutChoices;
  /** My position's rail on this job: what the rail shows while I have no pins. */
  recommended: readonly RailTool[];
  set: (patch: Partial<LayoutChoices>) => void;
}

function sameSpot(a: Spot | null, b: Spot | null): boolean {
  return a === b || (a !== null && b !== null && a.area === b.area && a.tool === b.tool);
}

function LayoutChoicesForm({ c, recommended, set }: ChoicesProps) {
  const [spot, setSpotState] = useState<Spot | null>(null);
  // Keeping the same object skips a render on every pointer move.
  const setSpot = (next: Spot | null) => {
    setSpotState((prev) => (sameSpot(prev, next) ? prev : next));
  };
  const rail = c.rail_items ?? [...recommended];
  // "Opens on" offers the tools on my rail (and the saved one, if an older layout left it off the rail).
  const opens = [...rail, ...(rail.includes(c.main_default) ? [] : [c.main_default])].map((t) => ({
    value: t,
    label: TOOL_META[t].label,
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="xl:order-2">
        <div className="xl:sticky xl:top-4">
          <LayoutPreview choices={{ ...c, rail_items: rail }} more={rail.length < RAIL_TOOLS.length} spot={spot} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 xl:order-1">
        <Group
          label="Rail"
          aside={
            <RailState
              pinned={c.rail_items !== null}
              onReset={() => {
                set({ rail_items: null });
              }}
            />
          }
        >
          <RailPicker choices={{ rail_items: rail, main_default: c.main_default }} onChange={set} onSpot={setSpot} />
        </Group>
        {/* Each row sits in the box that lights its spot in the preview; the list draws the lines between them. */}
        <div className="flex flex-col divide-y divide-line border-t border-line">
          <div {...pointAt({ area: 'main', tool: null }, setSpot)}>
            <SelectField
              label="Opens on"
              value={c.main_default}
              options={opens}
              className={FIELD_ROW}
              testId="layout-main-default"
              onChange={(v) => {
                const t = RAIL_TOOLS.find((x) => x === v);
                if (t) set({ main_default: t });
              }}
            />
          </div>
          <div {...pointAt({ area: 'right', tool: null }, setSpot)}>
            <SettingRow label="Right column">
              <DockedChoice
                value={c.docked_panel}
                onPick={(docked_panel) => {
                  set({ docked_panel });
                }}
              />
            </SettingRow>
          </div>
          <div {...pointAt({ area: 'whats_new', tool: null }, setSpot)}>
            <SettingRow label="Board">
              <CheckField
                label="What's new line"
                checked={c.whats_new_enabled}
                testId="layout-whats-new"
                onChange={(whats_new_enabled) => {
                  set({ whats_new_enabled });
                }}
              />
            </SettingRow>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LayoutForm({ projectId }: { projectId: string | null }) {
  const { layout, save, set } = useLayoutEditor();
  const recommended = useRecommendedRail(projectId, layout.data?.choices.recent_project_ids ?? []);
  return (
    <Card title="Layout" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={null} />}>
      {/* data-version: the saved row's version, so a test can wait for a save to land. */}
      <div data-testid="layout-card" data-version={layout.data?.version ?? 'none'} className="flex flex-col gap-5">
        <LayoutTips />
        {layout.isPending || recommended.isPending ? <LoadingState label="Loading your layout" /> : null}
        {layout.isError ? <ErrorState error={layout.error} onRetry={() => void layout.refetch()} /> : null}
        {recommended.error ? <ErrorState error={recommended.error} onRetry={recommended.refetch} /> : null}
        {layout.data && recommended.data ? (
          <LayoutChoicesForm c={layout.data.choices} recommended={recommended.data.rail} set={set} />
        ) : null}
      </div>
    </Card>
  );
}
