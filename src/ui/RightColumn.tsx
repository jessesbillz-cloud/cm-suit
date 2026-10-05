// The right column (SPEC §7.2): one docked panel, or the opened item. Fixed width (wider on a wide screen, never
// dragged); it can go full width or collapse.
import type { ReactNode } from 'react';
import { ChevronsLeft, ExternalLink, Maximize2, Minimize2, PanelRightClose, X } from 'lucide-react';
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

export function RightColumn(props: RightColumnProps) {
  const { title, collapsed, full, onToggleCollapsed, onToggleFull, onCloseItem, onOpenWindow, children } = props;
  if (collapsed) {
    return (
      <aside aria-label={title} className="flex w-6 shrink-0 flex-col items-center border-l border-line bg-card pt-2">
        <button
          type="button"
          aria-label={`Show ${title}`}
          title={`Show ${title}`}
          className="flex h-8 w-6 items-center justify-center text-ink-3 hover:text-ink"
          onClick={onToggleCollapsed}
        >
          <Icon icon={ChevronsLeft} size={14} />
        </button>
      </aside>
    );
  }
  return (
    <aside
      aria-label={title}
      data-testid="right-column"
      className={`flex min-h-0 flex-col border-l border-line bg-card ${full ? 'flex-1' : 'w-right shrink-0 wide:w-right-wide'}`}
    >
      <div className="flex min-h-14 shrink-0 border-b border-line py-2 pl-4 pr-2">
        {/* At full width the bar lines up with the item's centered column below it. */}
        <div className={`flex w-full items-center gap-1 ${full ? 'mx-auto max-w-reading' : ''}`}>
        <h2 data-testid="right-column-title" className="min-w-0 flex-1 wrap-anywhere text-[15px] font-semibold tracking-[-0.005em] text-ink">
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
          variant="quiet"
          icon={full ? Minimize2 : Maximize2}
          aria-label={full ? 'Back to normal width' : 'Full width'}
          title={full ? 'Back to normal width' : 'Full width'}
          onClick={onToggleFull}
        />
        {onCloseItem ? (
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
