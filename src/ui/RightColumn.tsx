// The right column (SPEC §7.2): one docked panel, or the opened item. Fixed width (wider on a wide screen, never
// dragged); it can go full screen or collapse. Full screen is ONE labelled button at the top right (Jesse, Oct 5: "the
// arrows ... make that more prevalent"); at full screen the same spot is Back, and Escape does the same.
import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ChevronsLeft, ExternalLink, Maximize2, PanelRightClose, X } from 'lucide-react';
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
      <aside aria-label={title} className="flex w-8 shrink-0 flex-col items-center border-l border-line bg-card pt-2">
        <button
          type="button"
          aria-label={`Show ${title}`}
          title={`Show ${title}`}
          className="flex h-9 w-8 items-center justify-center text-ink hover:text-accent"
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
      className={`flex min-h-0 flex-col border-l border-line bg-card ${full ? 'flex-1' : 'w-right shrink-0 wide:w-right-wide'}`}
    >
      <div className="flex min-h-14 shrink-0 border-b border-line py-2 pl-4 pr-2">
        {/* At full screen the bar lines up with the item's centered column below it. */}
        <div className={`flex w-full items-center gap-1.5 ${full ? 'mx-auto max-w-reading' : ''}`}>
          <h2 data-testid="right-column-title" className="min-w-0 flex-1 wrap-anywhere text-base font-bold text-ink">
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
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
