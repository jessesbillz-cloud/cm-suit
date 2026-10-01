// The right column (SPEC §7.2): one docked panel, or the opened item. Fixed width; it can go full width or collapse.
import type { ReactNode } from 'react';
import { ChevronsLeft, Maximize2, Minimize2, PanelRightClose, X } from 'lucide-react';
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
  children: ReactNode;
}

export function RightColumn({ title, collapsed, full, onToggleCollapsed, onToggleFull, onCloseItem, children }: RightColumnProps) {
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
      className={`flex min-h-0 flex-col border-l border-line bg-card ${full ? 'flex-1' : 'w-right shrink-0'}`}
    >
      <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-line py-2 pl-4 pr-2">
        <h2 className="min-w-0 flex-1 wrap-anywhere text-[15px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
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
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </aside>
  );
}
