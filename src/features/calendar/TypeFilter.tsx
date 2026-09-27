// The types a person shows (SPEC §7.6): a compact row of toggles that saves user_layout.calendar_types, the same field
// Settings > Layout edits (one source of truth).
import { useSaveLayout } from '../../data/mutations';
import { messageOf } from '../../data/errors';
import { CALENDAR_KINDS } from '../../lib/calendarKinds';
import { CALENDAR_TYPES } from '../../lib/layout';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

interface TypeFilterProps {
  selected: readonly string[];
}

export function TypeFilter({ selected }: TypeFilterProps) {
  const save = useSaveLayout();
  const toast = useToast();

  function toggle(kind: string) {
    const on = new Set(selected);
    if (on.has(kind)) on.delete(kind);
    else on.add(kind);
    save.mutate(
      { calendar_types: CALENDAR_TYPES.filter((k) => on.has(k)) },
      {
        onError: (e) => {
          toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
        },
      },
    );
  }

  return (
    <div role="group" aria-label="Types shown" className="flex flex-wrap gap-1.5">
      {CALENDAR_TYPES.map((kind) => {
        const on = selected.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            data-testid={`cal-type-${kind}`}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs ${
              on ? 'border-accent/30 bg-accent-soft text-accent' : 'border-line bg-card text-ink-3 hover:text-ink-2'
            }`}
            onClick={() => {
              toggle(kind);
            }}
          >
            <Icon icon={CALENDAR_KINDS[kind].icon} size={14} />
            {CALENDAR_KINDS[kind].label}
          </button>
        );
      })}
    </div>
  );
}
