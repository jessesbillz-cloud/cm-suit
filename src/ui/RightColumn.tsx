// The right column (SPEC §7.2): one docked panel, or the opened item. Fixed width (a third of the window, wide enough to
// read a page of a PDF; never dragged); it can go full screen or collapse. Full screen is ONE labelled button at the top right (Jesse, Oct 5: "the
// arrows ... make that more prevalent"); at full screen the same spot is Back, and Escape does the same. It is the
// one Full screen on an opened file: the file's own box has New window (Jesse, Oct 12).
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ChevronsLeft, ExternalLink, Maximize2, PanelRightClose, X } from 'lucide-react';
import { FOCUS_RING } from './box';
import { Button } from './Button';
import { Icon } from './Icon';

interface RightColumnProps {
  title: string;
  collapsed: boolean;
  full: boolean;
  onToggleCollapsed: () => void;
  onToggleFull: () => void;
  /** Present when an item is open: closing it brings the docked panel back. */
  onCloseItem?: (() => void) | undefined;
  /** "Open in new window" for an item whose own pane has no such button. */
  onOpenWindow?: (() => void) | undefined;
  children: ReactNode;
}

/** Escape leaves full screen, unless something on top (the file viewer, a dialog, a menu) took it first. */
function useEscapeBack(full: boolean, onBack: () => void) {
  const back = useRef(onBack);
  useEffect(() => {
    back.current = onBack;
  });
  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"], [role="dialog"], [role="menu"]') !== null) return;
      e.preventDefault();
      back.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [full]);
}

export function RightColumn(props: RightColumnProps) {
  const { title, collapsed, full, onToggleCollapsed, onToggleFull, onCloseItem, onOpenWindow, children } = props;
  useEscapeBack(full && !collapsed, onToggleFull);
  if (collapsed) {
    return (
      <aside aria-label={title} className="flex w-9 shrink-0 flex-col items-center border-l-[1.5px] border-ink bg-card pt-2">
        <button
          type="button"
          aria-label={`Show ${title}`}
          title={`Show ${title}`}
          className={`flex h-9 w-9 items-center justify-center text-ink hover:text-accent ${FOCUS_RING}`}
          onClick={onToggleCollapsed}
        >
          <Icon icon={ChevronsLeft} size={18} />
        </button>
      </aside>
    );
  }
  return (
    <aside
      aria-label={title}
      data-testid="right-column"
      data-full={full ? 'true' : 'false'}
      className={`flex min-h-0 flex-col border-l-[1.5px] border-ink bg-card shadow-[-10px_0_28px_-14px_rgba(16,18,20,.45)] ${full ? 'flex-1' : 'w-right shrink-0'}`}
    >
      <div className="flex min-h-14 shrink-0 border-b-2 border-ink py-2 pl-4 pr-2">
        <div className="flex w-full items-center gap-1.5">
          <h2 data-testid="right-column-title" className="heading min-w-0 flex-1 wrap-anywhere text-[18px] font-semibold text-ink">
            {title}
          </h2>
          {onOpenWindow ? (
            <Button
              size="sm"
              variant="quiet"
              icon={ExternalLink}
              aria-label="Open in new window"
              title="Open in new window"
              data-testid="item-open-window"
              onClick={onOpenWindow}
            />
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            icon={full ? ArrowLeft : Maximize2}
            title={full ? 'Back (Esc)' : 'Full screen'}
            className="font-semibold"
            data-testid="right-full"
            onClick={onToggleFull}
          >
            {full ? 'Back' : 'Full screen'}
          </Button>
          {full ? null : onCloseItem ? (
            <Button size="sm" variant="quiet" icon={X} aria-label="Close" title="Close" onClick={onCloseItem} />
          ) : (
            <Button
              size="sm"
              variant="quiet"
              icon={PanelRightClose}
              aria-label="Collapse the right column"
              title="Collapse the right column"
              onClick={onToggleCollapsed}
            />
          )}
        </div>
      </div>
      {/* Holding a file's box (FilePreview, data-fill), the column does not scroll: the box does (one scroll per screen). */}
      <div data-testid="right-column-body" className="min-h-0 flex-1 overflow-auto has-[[data-fill]]:overflow-hidden">
        {children}
      </div>
    </aside>
  );
}
