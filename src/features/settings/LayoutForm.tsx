// Settings > Layout: where the main area opens, what the right column holds, and the "What's new" line (SPEC §7.2). A
// live sketch shows where each choice lands, with the rail as the frame shows it. Each change saves at once. A job's
// tools on the rail are chosen on the rail itself (Edit under the job's name, 0051): one way to reach each thing.
import { useState } from 'react';
import { ALL_JOBS_TOOLS, type RailModel } from '../../lib/jobs';
import { DOCKED_PANELS, RAIL_TOOLS, type LayoutChoices } from '../../lib/layout';
import { Card } from '../../ui/Card';
import { CheckField, SelectField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { TOOL_META } from '../../ui/tools';
import { LayoutPreview, pointAt, type Spot } from './LayoutPreview';
import { LayoutTips } from './LayoutTips';
import { FIELD_ROW, SettingRow } from './SettingRow';
import { useLayoutEditor } from './useLayoutEditor';
import { usePreviewRail } from './usePreviewRail';

type Docked = LayoutChoices['docked_panel'];

const DOCKED_LABELS: Record<Docked, string> = { board: 'Board', none: 'Open item only' };

/** "/" opens All my jobs on one of these (HomeRedirect): the board or the calendar. */
const OPENS_ON = ALL_JOBS_TOOLS.filter((t) => t === 'board' || t === 'calendar');

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

interface ChoicesProps {
  c: LayoutChoices;
  /** The rail the frame shows here. */
  rail: RailModel;
  set: (patch: Partial<LayoutChoices>) => void;
}

function LayoutChoicesForm({ c, rail, set }: ChoicesProps) {
  const [spot, setSpot] = useState<Spot | null>(null);
  // "Opens on": the board or the calendar (and the saved one, if an older layout chose another tool).
  const opens = [...OPENS_ON, ...(OPENS_ON.some((t) => t === c.main_default) ? [] : [c.main_default])].map((t) => ({
    value: t,
    label: TOOL_META[t].label,
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="xl:order-2">
        <div className="xl:sticky xl:top-4">
          <LayoutPreview choices={c} rail={rail} spot={spot} />
        </div>
      </div>
      {/* Each row sits in the box that lights its spot in the preview; the list draws the lines between them. */}
      <div className="flex min-w-0 flex-col divide-y divide-line border-t border-line xl:order-1">
        <div {...pointAt('main', setSpot)}>
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
        <div {...pointAt('right', setSpot)}>
          <SettingRow label="Right column">
            <DockedChoice
              value={c.docked_panel}
              onPick={(docked_panel) => {
                set({ docked_panel });
              }}
            />
          </SettingRow>
        </div>
        <div {...pointAt('whats_new', setSpot)}>
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
  );
}

export function LayoutForm({ projectId }: { projectId: string | null }) {
  const { layout, save, set } = useLayoutEditor();
  const rail = usePreviewRail(projectId);
  return (
    <Card title="Layout" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={null} />}>
      {/* data-version: the saved row's version, so a test can wait for a save to land. */}
      <div data-testid="layout-card" data-version={layout.data?.version ?? 'none'} className="flex flex-col gap-5">
        <LayoutTips />
        {layout.isPending || rail.isPending ? <LoadingState label="Loading your layout" /> : null}
        {layout.isError ? <ErrorState error={layout.error} onRetry={() => void layout.refetch()} /> : null}
        {rail.error ? <ErrorState error={rail.error} onRetry={rail.refetch} /> : null}
        {layout.data && rail.data ? <LayoutChoicesForm c={layout.data.choices} rail={rail.data} set={set} /> : null}
      </div>
    </Card>
  );
}
