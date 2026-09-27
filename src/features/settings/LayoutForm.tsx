// The only layout choices a person has (SPEC §7.2): rail icons, main default, docked panel, collapsed panes,
// calendar types, notification kinds, and the "What's new" line. Each change saves at once.
import { useSaveLayout } from '../../data/mutations';
import { useUserLayout } from '../../data/queries';
import { messageOf } from '../../data/errors';
import { CALENDAR_TYPES, DOCKED_PANELS, NOTIFICATION_KINDS, RAIL_TOOLS, type LayoutChoices, type RailTool } from '../../lib/layout';
import { kindLabel } from '../../lib/calendarKinds';
import { humanize } from '../../lib/format';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';

interface CheckGroupProps {
  legend: string;
  options: readonly string[];
  selected: readonly string[];
  labelOf: (v: string) => string;
  onChange: (next: string[]) => void;
}

function CheckGroup({ legend, options, selected, labelOf, onChange }: CheckGroupProps) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-medium text-ink-2">{legend}</legend>
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={selected.includes(o)}
            onChange={(e) => {
              // Keep the canonical order of `options` so the rail does not reshuffle.
              const set = new Set(selected);
              if (e.target.checked) set.add(o);
              else set.delete(o);
              onChange(options.filter((x) => set.has(x)));
            }}
          />
          {labelOf(o)}
        </label>
      ))}
    </fieldset>
  );
}

const railLabel = (v: string) => TOOL_META[v as RailTool].label;

export function LayoutForm() {
  const layout = useUserLayout();
  const save = useSaveLayout();
  const toast = useToast();

  if (layout.isPending) return <LoadingState label="Loading your layout" />;
  if (layout.isError) return <ErrorState error={layout.error} onRetry={() => void layout.refetch()} />;
  const c = layout.data.choices;

  const set = (patch: Partial<LayoutChoices>) => {
    save.mutate(patch, {
      onError: (e) => {
        toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
      },
    });
  };

  return (
    <Card title="Layout">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <CheckGroup
          legend="Tools on the rail"
          options={RAIL_TOOLS}
          selected={c.rail_items}
          labelOf={railLabel}
          onChange={(next) => {
            set({ rail_items: next.filter((v): v is RailTool => (RAIL_TOOLS as readonly string[]).includes(v)) });
          }}
        />
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            Main area opens on
            <select
              className="h-9 rounded-md border border-line bg-card px-2 text-sm font-normal text-ink"
              value={c.main_default}
              onChange={(e) => {
                const v = RAIL_TOOLS.find((t) => t === e.target.value);
                if (v) set({ main_default: v });
              }}
            >
              {RAIL_TOOLS.map((t) => (
                <option key={t} value={t}>
                  {TOOL_META[t].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
            Right column shows
            <select
              className="h-9 rounded-md border border-line bg-card px-2 text-sm font-normal text-ink"
              value={c.docked_panel}
              onChange={(e) => {
                const v = DOCKED_PANELS.find((d) => d === e.target.value);
                if (v) set({ docked_panel: v });
              }}
            >
              {DOCKED_PANELS.map((d) => (
                <option key={d} value={d}>
                  {d === 'none' ? 'Nothing until I open an item' : TOOL_META[d].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={c.whats_new_enabled}
              onChange={(e) => {
                set({ whats_new_enabled: e.target.checked });
              }}
            />
            Show &ldquo;What&apos;s new since you were last in&rdquo;
          </label>
        </div>
        <div className="flex flex-col gap-4">
          <CheckGroup
            legend="Calendar shows"
            options={CALENDAR_TYPES}
            selected={c.calendar_types}
            labelOf={kindLabel}
            onChange={(next) => {
              set({ calendar_types: next });
            }}
          />
          <CheckGroup
            legend="Notify me about"
            options={NOTIFICATION_KINDS}
            selected={c.notification_kinds}
            labelOf={humanize}
            onChange={(next) => {
              set({ notification_kinds: next });
            }}
          />
        </div>
      </div>
    </Card>
  );
}
