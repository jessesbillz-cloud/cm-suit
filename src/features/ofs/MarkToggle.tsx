// "Fire / life safety" on an RFI, an RFI document or a submittal: one box that is on (the accent, with a check) or off.
// On sends it to the fire marshal (an RFI of the RFI tool once it is answered). Off has Undo, never a question.
import { Check, Flame } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useOfsMark, type MarkInput } from '../../data/ofs';
import type { OfsItem } from '../../data/ofs.types';
import { CLICK_BOX, FOCUS_RING } from '../../ui/box';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

interface MarkToggleProps {
  projectId: string;
  target: MarkInput['target'];
  item: OfsItem;
}

export function MarkToggle({ projectId, target, item }: MarkToggleProps) {
  const mark = useOfsMark();
  const toast = useToast();
  const on = item.marked;

  function set(next: boolean, version: number) {
    mark.mutate(
      { projectId, target, on: next, version },
      {
        onSuccess: (saved) => {
          if (next) return;
          toast.show({
            message: 'Not fire / life safety.',
            action: {
              label: 'Undo',
              onClick: () => {
                set(true, saved.version);
              },
            },
          });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: messageOf(e) });
        },
      },
    );
  }

  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid="ofs-mark"
      data-on={on ? 'true' : 'false'}
      disabled={mark.isPending}
      className={`flex min-h-11 items-center gap-2 self-start rounded-lg px-3.5 py-2 text-sm font-semibold ${
        on ? `border border-accent bg-accent text-white shadow-tile ${FOCUS_RING}` : `${CLICK_BOX} text-ink`
      }`}
      onClick={() => {
        set(!on, item.version);
      }}
    >
      <Icon icon={on ? Check : Flame} size={17} />
      Fire / life safety
    </button>
  );
}
