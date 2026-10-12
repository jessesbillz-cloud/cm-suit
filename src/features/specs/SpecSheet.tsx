// The spec book's sections on a phone: a sheet over the pages, opened from the bar. Picking a section goes there and
// closes it; Close or Escape closes it and leaves the viewer open. Tab stays inside it.
import { useRef } from 'react';
import { X } from 'lucide-react';
import type { SpecBookSection } from '../../data/specs';
import { Icon } from '../../ui/Icon';
import { SectionFinder } from './SectionFinder';

interface SpecSheetProps {
  sections: readonly SpecBookSection[];
  at: number;
  onPick: (page: number) => void;
  onClose: () => void;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input')];
}

export function SpecSheet({ sections, at, onPick, onClose }: SpecSheetProps) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Sections"
      data-testid="spec-sheet"
      className="fixed inset-0 z-[46] flex flex-col gap-3 bg-[#0b0f17] px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-[max(env(safe-area-inset-top),0.75rem)] text-white"
      onKeyDown={(e) => {
        const el = root.current;
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        } else if (e.key === 'Tab' && el) {
          e.stopPropagation();
          const list = focusables(el);
          const first = list[0];
          const last = list[list.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="px-1 text-[15px] font-semibold">Sections</h2>
        <button
          type="button"
          data-testid="spec-sheet-close"
          aria-label="Close sections"
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          onClick={onClose}
        >
          <Icon icon={X} size={20} />
        </button>
      </div>
      <SectionFinder
        sections={sections}
        at={at}
        autoFocus
        onPick={(page) => {
          onPick(page);
          onClose();
        }}
      />
    </div>
  );
}
