// One place on the rail, and More (the job's other tools in a small menu beside the rail). Both come in two widths: the
// open rail (icon over a short name) and the collapsed one (icon only, the name on hover and for screen readers). On a
// short screen (a laptop browser) the open rail's places are shorter, so a job's tools fit without scrolling.
import { useRef, useState, type KeyboardEvent } from 'react';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import type { RailTool, Tool } from '../lib/layout';
import { countOf, type ToolCounts } from '../lib/toolCounts';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { TOOL_META } from './tools';
import { useFitInWindow } from './useFitInWindow';

interface RailItemProps {
  testId: string;
  label: string;
  icon: LucideIcon;
  count: number;
  badgeId: string;
  active: boolean;
  /** Icon only (the collapsed rail). */
  compact: boolean;
  onClick: () => void;
  expanded?: boolean | undefined;
  /** Pointer over it or focus on it: start loading the tool's code, so the click doesn't wait. */
  onPreload?: (() => void) | undefined;
}

/** Icon over a short name (or the icon alone), the count at the icon's corner, an accent bar when it's open. */
export function RailItem({ testId, label, icon, count, badgeId, active, compact, onClick, expanded, onPreload }: RailItemProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onPointerEnter={onPreload}
      onFocus={onPreload}
      title={compact ? label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      className={`relative flex shrink-0 items-center justify-center rounded-lg transition-colors ${
        compact ? 'h-10 w-10' : 'h-[60px] w-[80px] flex-col gap-1 [@media(max-height:820px)]:h-12 [@media(max-height:820px)]:gap-0.5'
      } ${active || expanded ? 'bg-rail-active text-white' : 'text-rail-ink hover:bg-rail-hover hover:text-white'}`}
      onClick={onClick}
    >
      {active ? (
        <span aria-hidden="true" className={`absolute left-0 w-[3px] rounded-r bg-accent ${compact ? 'top-2 h-6' : 'top-3 h-9'}`} />
      ) : null}
      <Icon icon={icon} size={compact ? 20 : 22} />
      <span className={compact ? 'sr-only' : 'text-[12px] font-semibold leading-4'}>{label}</span>
      <CountBadge
        n={count}
        testId={badgeId}
        className={`absolute ring-2 ring-rail ${compact ? '-right-1 -top-1' : 'left-1/2 top-1 ml-1.5'}`}
      />
    </button>
  );
}

/** Up / Down move between the menu's tools; Escape closes it. */
function menuKeys(e: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (e.key === 'Escape') {
    close();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  const at = items.findIndex((b) => b === document.activeElement);
  const next = e.key === 'ArrowDown' ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
  items[next]?.focus();
}

interface RailMoreProps {
  tools: readonly RailTool[];
  counts: ToolCounts;
  current: Tool;
  compact: boolean;
  onSelect: (tool: Tool) => void;
  /** Opening the menu starts loading its tools' code. */
  onPreload?: ((tool: Tool) => void) | undefined;
}

/** More: the job's other tools in a small menu beside the rail. Lit while one of them is open. */
export function RailMore({ tools, counts, current, compact, onSelect, onPreload }: RailMoreProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useFitInWindow(menu, open);
  const close = () => {
    setOpen(false);
  };
  return (
    <div className="relative">
      <RailItem
        testId="rail-more"
        label="More"
        icon={Ellipsis}
        count={countOf(counts, tools)}
        badgeId="tool-badge-more"
        active={tools.some((t) => t === current)}
        compact={compact}
        expanded={open}
        onClick={() => {
          if (!open && onPreload) for (const t of tools) onPreload(t);
          setOpen(!open);
        }}
      />
      {open ? (
        <>
          {/* Backdrop: clicking outside closes the menu without a document listener. */}
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={close} />
          <div
            ref={menu}
            role="menu"
            aria-label="More tools"
            data-testid="rail-more-menu"
            className="absolute left-full top-0 z-40 ml-3 max-h-[calc(100vh-1rem)] w-56 overflow-y-auto rounded-card bg-card py-1.5 shadow-pop"
            onKeyDown={(e) => {
              menuKeys(e, close);
            }}
          >
            {tools.map((t, i) => (
              <button
                key={t}
                type="button"
                role="menuitem"
                autoFocus={i === 0}
                data-testid={`rail-more-${t}`}
                aria-current={t === current ? 'page' : undefined}
                className={`flex h-10 w-full items-center gap-3 px-3.5 text-left text-sm outline-none focus-visible:bg-page ${
                  t === current ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-page'
                }`}
                onClick={() => {
                  close();
                  onSelect(t);
                }}
              >
                <Icon icon={TOOL_META[t].icon} size={18} className={t === current ? 'text-accent' : 'text-ink-2'} />
                <span className="flex-1">{TOOL_META[t].label}</span>
                <CountBadge n={counts[t] ?? 0} testId={`tool-badge-${t}`} />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
