// Settings > Layout: the rail (which tools, in what order), where the main area opens, what the right column holds,
// and the "What's new" line (SPEC §7.2). A live sketch shows where each choice lands. Each change saves at once.
import { useState, type ReactNode } from 'react';
import { DOCKED_PANELS, RAIL_TOOLS, type LayoutChoices } from '../../lib/layout';
import { Card } from '../../ui/Card';
import { CheckField, SelectField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { LayoutPreview, pointAt, type Spot } from './LayoutPreview';
import { LayoutTips } from './LayoutTips';
import { RailPicker } from './RailPicker';
import { useLayoutEditor } from './useLayoutEditor';

type Docked = LayoutChoices['docked_panel'];

const DOCKED_LABELS: Record<Docked, string> = { board: 'Board', none: 'Open item only' };

function DockedChoice({ value, onPick }: { value: Docked; onPick: (v: Docked) => void }) {
  return (
    <div role="radiogroup" aria-label="Right column" className="inline-flex self-start rounded-md border border-line-strong bg-card p-0.5 shadow-control">
      {DOCKED_PANELS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={d === value}
          data-testid={`layout-docked-${d}`}
          className={`h-8 rounded px-3 text-sm ${d === value ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
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

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
    </div>
  );
}

interface ChoicesProps {
  c: LayoutChoices;
  set: (patch: Partial<LayoutChoices>) => void;
}

function sameSpot(a: Spot | null, b: Spot | null): boolean {
  return a === b || (a !== null && b !== null && a.area === b.area && a.tool === b.tool);
}

function LayoutChoicesForm({ c, set }: ChoicesProps) {
  const [spot, setSpotState] = useState<Spot | null>(null);
  // Keeping the same object skips a render on every pointer move.
  const setSpot = (next: Spot | null) => {
    setSpotState((prev) => (sameSpot(prev, next) ? prev : next));
  };
  // "Opens on" offers the tools on my rail (and the saved one, if an older layout left it off the rail).
  const opens = [...c.rail_items, ...(c.rail_items.includes(c.main_default) ? [] : [c.main_default])].map((t) => ({
    value: t,
    label: TOOL_META[t].label,
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="xl:order-2">
        <div className="xl:sticky xl:top-4">
          <LayoutPreview choices={c} spot={spot} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-5 xl:order-1">
        <Group label="Rail">
          <RailPicker choices={c} onChange={set} onSpot={setSpot} />
        </Group>
        <div {...pointAt({ area: 'main', tool: null }, setSpot)}>
          <SelectField
            label="Opens on"
            value={c.main_default}
            options={opens}
            className="sm:max-w-xs"
            testId="layout-main-default"
            onChange={(v) => {
              const t = RAIL_TOOLS.find((x) => x === v);
              if (t) set({ main_default: t });
            }}
          />
        </div>
        <div {...pointAt({ area: 'right', tool: null }, setSpot)}>
          <Group label="Right column">
            <DockedChoice
              value={c.docked_panel}
              onPick={(docked_panel) => {
                set({ docked_panel });
              }}
            />
          </Group>
        </div>
        <div {...pointAt({ area: 'whats_new', tool: null }, setSpot)}>
          <CheckField
            label="What's new line on the board"
            checked={c.whats_new_enabled}
            testId="layout-whats-new"
            onChange={(whats_new_enabled) => {
              set({ whats_new_enabled });
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function LayoutForm() {
  const { layout, save, set } = useLayoutEditor();
  return (
    <Card title="Layout" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={null} />}>
      {/* data-version: the saved row's version, so a test can wait for a save to land. */}
      <div data-testid="layout-card" data-version={layout.data?.version ?? 'none'} className="flex flex-col gap-5">
        <LayoutTips />
        {layout.isPending ? <LoadingState label="Loading your layout" /> : null}
        {layout.isError ? <ErrorState error={layout.error} onRetry={() => void layout.refetch()} /> : null}
        {layout.data ? <LayoutChoicesForm c={layout.data.choices} set={set} /> : null}
      </div>
    </Card>
  );
}
