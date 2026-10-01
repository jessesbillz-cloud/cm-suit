// Phone primitives (SPEC §7.7): one screen at a time. A top bar with an optional back button, a body that scrolls,
// and a bottom bar of tools. The phone has its own layout; it never shrinks the desktop frame.
import type { ReactNode } from 'react';
import { ChevronLeft, Ellipsis, Pencil } from 'lucide-react';
import type { Tool } from '../lib/layout';
import { countOf, type ToolCounts } from '../lib/toolCounts';
import { Button } from './Button';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { TOOL_META } from './tools';

interface PanelScreenProps {
  top: ReactNode;
  children: ReactNode;
  bottom?: ReactNode | undefined;
}

export function PanelScreen({ top, children, bottom }: PanelScreenProps) {
  return (
    <div className="flex h-[100dvh] flex-col bg-page">
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-2 pt-[env(safe-area-inset-top)]">
        {top}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {bottom}
    </div>
  );
}

export function PanelBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" className="flex h-10 items-center gap-1 px-1 text-sm text-accent" onClick={onBack}>
      <Icon icon={ChevronLeft} size={18} />
      {label}
    </button>
  );
}

interface PanelTabBarProps {
  tools: readonly Tool[];
  current: Tool;
  onSelect: (tool: Tool) => void;
  /** What needs me, per tool (a badge on each tab; More adds up what's under it). */
  counts: ToolCounts;
  /** The tools under More, for its count. */
  moreTools: readonly Tool[];
  /** Shown when there are more tools than the bar holds: a More button. */
  onMore?: (() => void) | undefined;
  moreOpen?: boolean | undefined;
}

interface TabButtonProps {
  testId: string;
  badgeId: string;
  label: string;
  icon: typeof Ellipsis;
  count: number;
  active: boolean;
  onClick: () => void;
}

function TabButton({ testId, badgeId, label, icon, count, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${active ? 'text-accent' : 'text-ink-2'}`}
      onClick={onClick}
    >
      <Icon icon={icon} size={22} />
      {label}
      <CountBadge n={count} testId={badgeId} className="absolute left-1/2 top-1 ml-1.5 ring-2 ring-card" />
    </button>
  );
}

export function PanelTabBar({ tools, current, onSelect, counts, moreTools, onMore, moreOpen = false }: PanelTabBarProps) {
  return (
    <nav
      aria-label="Tools"
      className="flex shrink-0 items-stretch justify-around border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {tools.map((t) => (
        <TabButton
          key={t}
          testId={`phone-tab-${t}`}
          badgeId={`tool-badge-${t}`}
          label={TOOL_META[t].label}
          icon={TOOL_META[t].icon}
          count={counts[t] ?? 0}
          active={t === current && !moreOpen}
          onClick={() => {
            onSelect(t);
          }}
        />
      ))}
      {onMore ? (
        <TabButton
          testId="phone-tab-more"
          badgeId="tool-badge-more"
          label="More"
          icon={Ellipsis}
          count={countOf(counts, moreTools)}
          active={moreOpen}
          onClick={onMore}
        />
      ) : null}
    </nav>
  );
}

interface PanelMoreSheetProps {
  tools: readonly Tool[];
  current: Tool;
  counts: ToolCounts;
  onSelect: (tool: Tool) => void;
  /** On a job: choose which of its tools sit on the bar (the desktop rail's Edit). */
  onEdit?: (() => void) | undefined;
}

/** The tools that don't fit on the bar, as big buttons above it, each with its count; on a job, Edit tools. */
export function PanelMoreSheet({ tools, current, counts, onSelect, onEdit }: PanelMoreSheetProps) {
  return (
    <div data-testid="phone-more" className="grid shrink-0 grid-cols-3 gap-2 border-t border-line bg-card p-3">
      {tools.map((t) => (
        <button
          key={t}
          type="button"
          data-testid={`phone-more-${t}`}
          aria-current={t === current ? 'page' : undefined}
          className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-md text-sm ${
            t === current ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-page'
          }`}
          onClick={() => {
            onSelect(t);
          }}
        >
          <Icon icon={TOOL_META[t].icon} size={24} />
          {TOOL_META[t].label}
          <CountBadge n={counts[t] ?? 0} testId={`tool-badge-${t}`} className="absolute left-1/2 top-1.5 ml-2 ring-2 ring-card" />
        </button>
      ))}
      {onEdit ? (
        <Button variant="quiet" icon={Pencil} data-testid="phone-more-edit" className="col-span-3 justify-self-end" onClick={onEdit}>
          Edit tools
        </Button>
      ) : null}
    </div>
  );
}
