// The permit pane's small menus (other moves, a new review's kind): a list of choices under its button that closes
// on a tap outside (a backdrop, as the job picker does) or Escape, and focuses its first choice.
import { useEffect, useRef, type ReactNode } from 'react';

interface DropMenuProps {
  open: boolean;
  onClose: () => void;
  /** Which side of the button it lines up with. */
  align: 'left' | 'right';
  children: ReactNode;
}

export function DropMenu({ open, onClose, align, children }: DropMenuProps) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-20" aria-hidden="true" data-testid="menu-backdrop" onClick={onClose} />
      <div
        role="menu"
        className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full z-30 mt-1 flex min-w-[12rem] flex-col rounded-lg border border-line bg-card py-1 shadow-pop`}
        ref={list}
      >
        {children}
      </div>
    </>
  );
}
