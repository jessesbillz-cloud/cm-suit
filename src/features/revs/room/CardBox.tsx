// One box on a room card's Setup (0119; Jesse, Oct 23: "I don't know what the colors mean, what they're doing or what
// they indicate"): it says its state in a word, in lib/status's card color (cardLook). Needed is white, Not needed grey
// and struck, Signed off green, Asked for blue, Failed red. A sign-off or a request carries a small lock (Setup never
// changes it). A box changed and not saved has a dashed outline, so Save and Cancel say what they act on. Never black.
import { Lock } from 'lucide-react';
import { CARD_STATE, type CardState } from '../../../lib/status';
import { Icon } from '../../../ui/Icon';
import { cardLook } from '../boxLook';
import { isKept } from './cardSetup';

/** A box's state, or the All walls box's Some (needed on some walls, not on others). */
type Shown = CardState | 'some';

interface CardBoxProps {
  state: Shown;
  changed: boolean;
  /** A locked card: the box reads only. */
  readOnly: boolean;
  /** Spoken and on hover: "North wall, Speed Plugs: Needed". */
  name: string;
  testId: string;
  onTap: () => void;
}

const LABEL: Record<Shown, string> = {
  needed: CARD_STATE.needed.label,
  not_needed: CARD_STATE.not_needed.label,
  signed_off: CARD_STATE.signed_off.label,
  asked_for: CARD_STATE.asked_for.label,
  failed: CARD_STATE.failed.label,
  some: 'Some',
};

export function CardBox({ state, changed, readOnly, name, testId, onTap }: CardBoxProps) {
  const look = cardLook(state === 'some' ? 'needed' : state);
  const kept = state !== 'some' && isKept(state);
  const word = LABEL[state];
  return (
    <button
      type="button"
      disabled={readOnly}
      aria-label={`${name}: ${word}${changed ? ', changed' : ''}`}
      title={`${name}: ${word}`}
      data-testid={testId}
      data-state={state}
      data-changed={changed ? 'true' : undefined}
      className={`flex min-h-11 w-full items-center justify-center gap-1 rounded-md border-2 px-2 py-1 text-center text-[13px] font-semibold leading-4 transition-[filter,transform] duration-100 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-default disabled:hover:brightness-100 disabled:active:scale-100 ${look.className} ${
        changed ? 'outline-dashed outline-2 outline-offset-2 outline-ink' : ''
      } ${state === 'not_needed' ? 'line-through decoration-2' : ''} ${state === 'some' ? 'text-ink-2' : ''}`}
      style={look.style}
      onClick={onTap}
    >
      {kept ? <Icon icon={Lock} size={12} className="shrink-0" /> : null}
      <span className="min-w-0 break-words">{word}</span>
    </button>
  );
}
