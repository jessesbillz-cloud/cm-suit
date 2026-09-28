// Settings > Notify me about (SPEC §7.8): a tree of areas and their events, from the one list in lib/layout. A child
// box is one event; a parent box sets all of its children and shows a dash when some are on. Saves at once.
import { ClipboardCheck, Folder, Gavel, ListChecks, ListTodo, MessageCircleQuestion, Truck, type LucideIcon } from 'lucide-react';
import { NOTIFY_AREAS, areaState, setNotify, type NotifyArea, type NotifyAreaDef } from '../../lib/layout';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { useLayoutEditor } from './useLayoutEditor';

const AREA_ICONS: Record<NotifyArea, LucideIcon> = {
  tasks: ListTodo,
  rfis: MessageCircleQuestion,
  inspections: ClipboardCheck,
  deliveries: Truck,
  corrections: ListChecks,
  bids: Gavel,
  files: Folder,
};

interface AreaProps {
  area: NotifyAreaDef & { key: NotifyArea };
  on: readonly string[];
  onChange: (next: ReturnType<typeof setNotify>) => void;
}

function AreaBranch({ area, on, onChange }: AreaProps) {
  const state = areaState(area, on);
  return (
    <fieldset data-testid={`notify-area-${area.key}`} data-state={state} className="flex flex-col">
      <legend className="sr-only">{area.label}</legend>
      <label className="flex h-10 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink sm:h-9">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-accent"
          data-testid={`notify-parent-${area.key}`}
          checked={state === 'all'}
          ref={(el) => {
            if (el) el.indeterminate = state === 'some';
          }}
          onChange={() => {
            // A mixed parent turns everything on, like any tree of checkboxes.
            onChange(setNotify(on, area.events.map((e) => e.key), state !== 'all'));
          }}
        />
        <Icon icon={AREA_ICONS[area.key]} size={16} className="shrink-0 text-ink-2" />
        {area.label}
      </label>
      <ul className="ml-[7px]">
        {area.events.map((e) => (
          <li
            key={e.key}
            className="relative pl-5 before:absolute before:left-0 before:top-1/2 before:h-px before:w-3 before:bg-line-strong after:absolute after:left-0 after:top-0 after:h-full after:w-px after:bg-line-strong last:after:h-1/2"
          >
            <label className="flex h-10 cursor-pointer items-center gap-2.5 text-sm text-ink sm:h-8">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-accent"
                data-testid={`notify-${e.key}`}
                checked={on.includes(e.key)}
                onChange={(ev) => {
                  onChange(setNotify(on, [e.key], ev.target.checked));
                }}
              />
              <span>
                {e.label}
                {e.note ? <span className="ml-2 rounded bg-page px-1.5 py-0.5 text-[11px] text-ink-2">{e.note}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function NotifyTree() {
  const { layout, save, set } = useLayoutEditor();
  return (
    <Card title="Notify me about" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={null} />}>
      {layout.isPending ? <LoadingState label="Loading your notifications" /> : null}
      {layout.isError ? <ErrorState error={layout.error} onRetry={() => void layout.refetch()} /> : null}
      {layout.data ? (
        <div data-testid="notify-tree" data-version={layout.data.version ?? 'none'} className="grid gap-x-6 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">
          {NOTIFY_AREAS.map((a) => (
            <AreaBranch
              key={a.key}
              area={a}
              on={layout.data.choices.notification_kinds}
              onChange={(notification_kinds) => {
                set({ notification_kinds });
              }}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
