// The rail (SPEC §7.2; Jesse, Sep 28: lean, by position, actionable): the tools for my position on this job (or my
// pins), each with a count of what needs me there, then More for the job's other tools, Settings pinned at the bottom.
// A dark navy strip down the whole left edge with the product mark on top, so the white work area reads as the page.
// It collapses to a thin strip; nobody drags or resizes it.
import { useState, type KeyboardEvent } from 'react';
import { ChevronsLeft, ChevronsRight, Ellipsis, type LucideIcon } from 'lucide-react';
import { FUTURE_NAME } from '../lib/brand';
import type { RailTool, Tool } from '../lib/layout';
import { countOf, type ToolCounts } from '../lib/toolCounts';
import { BrandMark } from './BrandMark';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { TOOL_META } from './tools';

interface RailProps {
  items: readonly RailTool[];
  /** The job's other tools, under More. */
  more: readonly RailTool[];
  counts: ToolCounts;
  current: Tool;
  collapsed: boolean;
  onSelect: (tool: Tool) => void;
  onToggleCollapsed: () => void;
}

interface RailItemProps {
  testId: string;
  label: string;
  icon: LucideIcon;
  count: number;
  badgeId: string;
  active: boolean;
  onClick: () => void;
  expanded?: boolean | undefined;
}

/** One place on the rail: icon over a short name, the count at the icon's corner, an accent bar when it's open. */
function RailItem({ testId, label, icon, count, badgeId, active, onClick, expanded }: RailItemProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      className={`relative flex h-[60px] w-[80px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
        active || expanded ? 'bg-rail-active text-white' : 'text-rail-ink hover:bg-rail-hover hover:text-white'
      }`}
      onClick={onClick}
    >
      {active ? <span aria-hidden="true" className="absolute left-0 top-3 h-9 w-[3px] rounded-r bg-accent" /> : null}
      <Icon icon={icon} size={22} />
      <span className="text-[12px] font-medium leading-4">{label}</span>
      <CountBadge n={count} testId={badgeId} className="absolute left-1/2 top-1 ml-1.5 ring-2 ring-rail" />
    </button>
  );
}

interface RailMoreProps {
  tools: readonly RailTool[];
  counts: ToolCounts;
  current: Tool;
  onSelect: (tool: Tool) => void;
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

/** More: the job's other tools in a small menu beside the rail. Lit while one of them is open. */
function RailMore({ tools, counts, current, onSelect }: RailMoreProps) {
  const [open, setOpen] = useState(false);
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
        expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      />
      {open ? (
        <>
          {/* Backdrop: clicking outside closes the menu without a document listener. */}
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={close} />
          <div
            role="menu"
            aria-label="More tools"
            data-testid="rail-more-menu"
            className="absolute left-full top-0 z-40 ml-3 w-56 rounded-card bg-card py-1.5 shadow-pop"
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

/** The product mark on top of the rail. */
function Mark() {
  return (
    <div className="flex h-14 w-full shrink-0 items-center justify-center" title={FUTURE_NAME}>
      <BrandMark size="md" />
    </div>
  );
}

export function Rail({ items, more, counts, current, collapsed, onSelect, onToggleCollapsed }: RailProps) {
  if (collapsed) {
    const waiting = countOf(counts, [...items, ...more]) > 0;
    return (
      <nav aria-label="Tools" className="flex w-5 shrink-0 flex-col items-center gap-2 bg-rail pt-16">
        <button
          type="button"
          aria-label="Show the tool rail"
          title="Show the tool rail"
          className="flex h-8 w-5 items-center justify-center text-rail-ink hover:text-white"
          onClick={onToggleCollapsed}
        >
          <Icon icon={ChevronsRight} size={14} />
        </button>
        {waiting ? <span data-testid="tool-waiting" aria-label="Something needs you" role="img" className="h-2 w-2 rounded-full bg-accent" /> : null}
      </nav>
    );
  }
  return (
    <nav aria-label="Tools" className="flex w-rail shrink-0 flex-col items-center bg-rail pb-2">
      <Mark />
      <div className="flex min-h-0 w-full flex-col items-center gap-1 overflow-y-auto pt-2">
        {items.map((t) => (
          <RailItem
            key={t}
            testId={`rail-${t}`}
            label={TOOL_META[t].label}
            icon={TOOL_META[t].icon}
            count={counts[t] ?? 0}
            badgeId={`tool-badge-${t}`}
            active={t === current}
            onClick={() => {
              onSelect(t);
            }}
          />
        ))}
      </div>
      {more.length > 0 ? (
        <div className="mt-1 flex w-full justify-center">
          <RailMore tools={more} counts={counts} current={current} onSelect={onSelect} />
        </div>
      ) : null}
      <div className="flex-1" />
      <div className="mt-2 flex w-full flex-col items-center gap-1 border-t border-rail-line pt-2">
        <RailItem
          testId="rail-settings"
          label={TOOL_META.settings.label}
          icon={TOOL_META.settings.icon}
          count={0}
          badgeId="tool-badge-settings"
          active={current === 'settings'}
          onClick={() => {
            onSelect('settings');
          }}
        />
        <button
          type="button"
          aria-label="Collapse the tool rail"
          title="Collapse the tool rail"
          className="flex h-7 w-10 items-center justify-center rounded-md text-rail-ink hover:bg-rail-hover hover:text-white"
          onClick={onToggleCollapsed}
        >
          <Icon icon={ChevronsLeft} size={16} />
        </button>
      </div>
    </nav>
  );
}
