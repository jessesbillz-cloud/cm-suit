// What sits behind one link in a pane (History, Earlier versions): a tap shows it under the link, scrolls it into view
// and focuses it, so the tap visibly lands somewhere (Jesse, Oct 5: "I clicked on it and nothing happened"). A second
// tap hides it again. The one way every pane opens a section in place.
import { useState, type ReactNode } from 'react';
import { History, type LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

/** Brings a section that just appeared into view (smoothly unless the person asked for less motion) and focuses it. */
function reveal(el: HTMLElement | null): void {
  if (el === null) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

interface BehindLinkProps {
  label: string;
  icon?: LucideIcon | undefined;
  testId?: string | undefined;
  className?: string | undefined;
  /** Shown (and mounted, so its data loads) only once the link is tapped. */
  children: ReactNode;
}

export function BehindLink({ label, icon = History, testId, className = '', children }: BehindLinkProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        className={`inline-flex h-8 items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-accent hover:underline ${className}`}
        data-testid={testId}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <Icon icon={icon} size={14} />
        {label}
      </button>
      {open ? (
        <div ref={reveal} tabIndex={-1} className="scroll-mt-3 outline-none" data-testid={testId ? `${testId}-shown` : undefined}>
          {children}
        </div>
      ) : null}
    </>
  );
}
