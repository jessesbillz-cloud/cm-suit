// Settings > Calendar subscriptions (SPEC §7.6): the kinds of lines my calendar shows, grouped, with the calendar's
// own labels and icons (lib/calendarKinds). The same field the calendar's type toggles save (calendar_types).
import { CALENDAR_KINDS } from '../../lib/calendarKinds';
import { CALENDAR_TYPES } from '../../lib/layout';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { useLayoutEditor } from './useLayoutEditor';

type Kind = (typeof CALENDAR_TYPES)[number];

const GROUPS = ['Inspections', 'Site', 'Schedule', 'Mine'] as const;

/** Every kind sits in exactly one group (a Record, so a new kind cannot be left out). */
const GROUP_OF: Record<Kind, (typeof GROUPS)[number]> = {
  inspections: 'Inspections',
  special_inspections: 'Inspections',
  deliveries: 'Site',
  pours: 'Site',
  meetings: 'Schedule',
  milestones: 'Schedule',
  lookahead: 'Schedule',
  my_due: 'Mine',
};

interface KindsProps {
  /** The saved row's version, so a test can wait for a save to land. */
  version: number | null;
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

function KindGroups({ version, selected, onChange }: KindsProps) {
  function toggle(kind: Kind, on: boolean) {
    const set = new Set(selected);
    if (on) set.add(kind);
    else set.delete(kind);
    // Canonical order, like the calendar's own toggles.
    onChange(CALENDAR_TYPES.filter((k) => set.has(k)));
  }

  return (
    <div data-testid="cal-subs" data-version={version ?? 'none'} className="grid gap-x-6 gap-y-5 sm:grid-cols-2 2xl:grid-cols-4">
      {GROUPS.map((g) => (
        <fieldset key={g} className="flex flex-col">
          <legend className="mb-1 text-[12px] font-bold uppercase tracking-wide text-ink">{g}</legend>
          {CALENDAR_TYPES.filter((k) => GROUP_OF[k] === g).map((k) => (
            <label key={k} className="flex h-10 cursor-pointer items-center gap-2.5 text-sm text-ink sm:h-9">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-accent"
                data-testid={`cal-sub-${k}`}
                checked={selected.includes(k)}
                onChange={(e) => {
                  toggle(k, e.target.checked);
                }}
              />
              <Icon icon={CALENDAR_KINDS[k].icon} size={16} className="shrink-0 text-ink-2" />
              {CALENDAR_KINDS[k].label}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

export function CalendarSubscriptions() {
  const { layout, save, set } = useLayoutEditor();
  return (
    <Card title="Calendar subscriptions" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={null} />}>
      {layout.isPending ? <LoadingState label="Loading your calendar" /> : null}
      {layout.isError ? <ErrorState error={layout.error} onRetry={() => void layout.refetch()} /> : null}
      {layout.data ? (
        <KindGroups
          version={layout.data.version}
          selected={layout.data.choices.calendar_types}
          onChange={(calendar_types) => {
            set({ calendar_types });
          }}
        />
      ) : null}
    </Card>
  );
}
