// Phone primitives (SPEC §7.7): one screen at a time. A top bar with an optional back button, a body that scrolls,
// and a bottom bar of tools. The phone has its own layout; it never shrinks the desktop frame.
import type { ReactNode } from 'react';
import { ChevronLeft, Ellipsis } from 'lucide-react';
import type { Tool } from '../lib/layout';
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
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-2 pt-[env(safe-area-inset-top)]">
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
  /** Shown when there are more tools than the bar holds: a More button. */
  onMore?: (() => void) | undefined;
  moreOpen?: boolean | undefined;
}

interface TabButtonProps {
  testId: string;
  label: string;
  icon: typeof Ellipsis;
  active: boolean;
  onClick: () => void;
}

function TabButton({ testId, label, icon, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${active ? 'text-accent' : 'text-ink-2'}`}
      onClick={onClick}
    >
      <Icon icon={icon} size={22} />
      {label}
    </button>
  );
}

export function PanelTabBar({ tools, current, onSelect, onMore, moreOpen = false }: PanelTabBarProps) {
  return (
    <nav
      aria-label="Tools"
      className="flex shrink-0 items-stretch justify-around border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {tools.map((t) => (
        <TabButton
          key={t}
          testId={`phone-tab-${t}`}
          label={TOOL_META[t].label}
          icon={TOOL_META[t].icon}
          active={t === current && !moreOpen}
          onClick={() => {
            onSelect(t);
          }}
        />
      ))}
      {onMore ? <TabButton testId="phone-tab-more" label="More" icon={Ellipsis} active={moreOpen} onClick={onMore} /> : null}
    </nav>
  );
}

/** The tools that don't fit on the bar, as big buttons above it. */
export function PanelMoreSheet({ tools, current, onSelect }: { tools: readonly Tool[]; current: Tool; onSelect: (tool: Tool) => void }) {
  return (
    <div data-testid="phone-more" className="grid shrink-0 grid-cols-3 gap-2 border-t border-line bg-card p-3">
      {tools.map((t) => (
        <button
          key={t}
          type="button"
          data-testid={`phone-more-${t}`}
          aria-current={t === current ? 'page' : undefined}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-md text-sm ${
            t === current ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-page'
          }`}
          onClick={() => {
            onSelect(t);
          }}
        >
          <Icon icon={TOOL_META[t].icon} size={24} />
          {TOOL_META[t].label}
        </button>
      ))}
    </div>
  );
}
