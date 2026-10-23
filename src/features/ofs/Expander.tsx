// One group of a cascading list (For review, the designated person's lists): a big box that says what it holds and how
// many, and opens to show it. Nested groups step in.
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CLICK_BOX } from '../../ui/box';
import { Icon } from '../../ui/Icon';

interface ExpanderProps {
  /** Stable across renders: the open state is kept by it. */
  id: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: (id: string) => void;
  /** 0: a top group (largest). */
  depth?: number | undefined;
  children: ReactNode;
}

// A top group's words in the display face (Oct 23); the nested ones stay plain (spec section names, file kinds).
const SIZE = ['heading min-h-16 text-[20px] tracking-[0.06em]', 'min-h-12 text-[15px]', 'min-h-11 text-sm'] as const;

export function Expander({ id, label, count, open, onToggle, depth = 0, children }: ExpanderProps) {
  return (
    <div data-testid="ofs-group" data-group={id} className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        data-testid="ofs-group-head"
        className={`flex w-full items-center gap-2 rounded-card px-3.5 py-2 text-left font-semibold text-ink ${SIZE[Math.min(depth, 2)] ?? SIZE[0]} ${CLICK_BOX}`}
        onClick={() => {
          onToggle(id);
        }}
      >
        <Icon icon={open ? ChevronDown : ChevronRight} size={18} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1 break-words">{label}</span>
        <span
          data-testid="ofs-group-count"
          className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-[5px] bg-ink px-2 font-sans text-[14px] font-bold tabular-nums tracking-normal text-white"
        >
          {String(count)}
        </span>
      </button>
      {open ? <div className={`flex flex-col gap-2 ${depth < 2 ? 'pl-3 sm:pl-5' : 'pl-2'}`}>{children}</div> : null}
    </div>
  );
}
