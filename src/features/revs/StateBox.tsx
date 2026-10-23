// The inspection cards' one box (boxLook): a tappable button that says what it is, the whole of it in its state's color
// (passed green with a check, requested gold, failed red, open white with a strong edge), the accent when picked, and a
// dashed white box when switched off (a wall or item not on a room's card). Big on the forms (lg), smaller on the tiles.
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { BOX_WORD, boxLook, type BoxState } from './boxLook';

interface StateBoxProps {
  state: BoxState;
  label: string;
  /** Before the name (a map color swatch). */
  mark?: ReactNode;
  picked?: boolean | undefined;
  /** Switched off: a dashed white box. */
  off?: boolean | undefined;
  /** Shown elsewhere (on the drawing): ringed. */
  focus?: boolean | undefined;
  /** A box that picks says so (aria-pressed); one that opens something leaves it out. */
  pressed?: boolean | undefined;
  disabled?: boolean | undefined;
  /** Faded: not pickable now (three picked already). */
  dim?: boolean | undefined;
  size?: 'md' | 'lg' | undefined;
  /** Fills its cell (a grid of boxes). */
  wide?: boolean | undefined;
  /** Spoken and on hover; default "<label>: <state>". */
  name?: string | undefined;
  testId?: string | undefined;
  /** data-status: the cell's status ('na' too), on an inner mark (default) or on the box itself. */
  status?: string | undefined;
  statusOnBox?: boolean | undefined;
  /** More data- attributes for the box. */
  data?: Record<`data-${string}`, string | undefined> | undefined;
  onClick: () => void;
}

const SIZE = {
  md: 'min-h-10 gap-1 rounded-md px-2.5 py-1 text-[13px] sm:min-h-9',
  lg: 'min-h-12 gap-1.5 rounded-lg px-3.5 py-2 text-[15px]',
} as const;

export function StateBox(p: StateBoxProps) {
  const size = p.size ?? 'lg';
  const look = boxLook(p.state, p.picked === true);
  const off = p.off === true && p.picked !== true;
  const cls = off ? 'border-dashed bg-card text-ink-3 border-line-strong' : look.className;
  const word = off ? 'Off' : BOX_WORD[p.state];
  const check = !off && p.picked !== true && p.state === 'passed';
  return (
    <button
      type="button"
      aria-pressed={p.pressed}
      disabled={p.disabled}
      aria-label={p.name ?? `${p.label}: ${word}`}
      title={p.name ?? `${p.label}: ${word}`}
      data-testid={p.testId}
      data-state={off ? 'off' : p.state}
      data-status={p.statusOnBox ? p.status : undefined}
      data-focus={p.focus ? 'true' : undefined}
      {...p.data}
      className={`relative ${p.wide ? 'flex w-full' : 'inline-flex max-w-full'} items-center border-2 text-left font-semibold leading-5 shadow-tile wrap-anywhere transition-[box-shadow,transform,filter] duration-150 hover:-translate-y-px hover:shadow-tile-hover hover:brightness-95 active:translate-y-0 active:shadow-press focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-tile disabled:hover:brightness-100 ${SIZE[size]} ${cls} ${
        p.focus ? 'ring-2 ring-accent ring-offset-2' : ''
      } ${p.dim ? 'opacity-50' : ''}`}
      style={off ? undefined : look.style}
      onClick={p.onClick}
    >
      {p.mark}
      {check ? <Icon icon={Check} size={size === 'lg' ? 17 : 14} className="shrink-0" /> : null}
      <span className="min-w-0 break-words" data-status={p.statusOnBox ? undefined : p.status}>
        {p.label}
      </span>
    </button>
  );
}
