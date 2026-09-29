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
    // Phone: one row that scrolls sideways, so the week stays in view. Desktop: the chips wrap.
    <div role="group" aria-label="Types shown" className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {CALENDAR_TYPES.map((kind) => {
        const on = selected.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            data-testid={`cal-type-${kind}`}
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] sm:h-8 sm:gap-1 sm:px-2 sm:text-xs ${
              on ? 'border-accent/30 bg-accent-soft font-medium text-accent' : 'border-line bg-card text-ink-3 hover:border-line-strong hover:text-ink-2'
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
