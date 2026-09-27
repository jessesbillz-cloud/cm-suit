// The rail (SPEC §7.2): fixed width, the tools this person turned on (icon + name), Settings pinned at the bottom.
// It collapses to a thin strip; nobody drags or resizes it.
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { RailTool, Tool } from '../lib/layout';
import { Icon } from './Icon';
import { TOOL_META } from './tools';

interface RailProps {
  items: readonly RailTool[];
  current: Tool;
  collapsed: boolean;
  onSelect: (tool: Tool) => void;
  onToggleCollapsed: () => void;
}

interface RailButtonProps {
  tool: Tool;
  active: boolean;
  onSelect: (tool: Tool) => void;
}

function RailButton({ tool, active, onSelect }: RailButtonProps) {
  const meta = TOOL_META[tool];
  return (
    <button
      type="button"
      data-testid={`rail-${tool}`}
      aria-current={active ? 'page' : undefined}
      className={`flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-md ${
        active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-page hover:text-ink'
      }`}
      onClick={() => {
        onSelect(tool);
      }}
    >
      <Icon icon={meta.icon} size={26} />
      <span className="text-sm font-medium">{meta.label}</span>
    </button>
  );
}

export function Rail({ items, current, collapsed, onSelect, onToggleCollapsed }: RailProps) {
  if (collapsed) {
    return (
      <nav aria-label="Tools" className="flex w-5 shrink-0 flex-col items-center border-r border-line bg-card pt-2">
        <button
          type="button"
          aria-label="Show the tool rail"
          title="Show the tool rail"
          className="flex h-8 w-5 items-center justify-center text-ink-3 hover:text-ink"
          onClick={onToggleCollapsed}
        >
          <Icon icon={ChevronsRight} size={14} />
        </button>
      </nav>
    );
  }
  return (
    <nav aria-label="Tools" className="flex w-rail shrink-0 flex-col items-center gap-1 border-r border-line bg-card py-2">
      {items.map((t) => (
        <RailButton key={t} tool={t} active={t === current} onSelect={onSelect} />
      ))}
      <div className="flex-1" />
      <RailButton tool="settings" active={current === 'settings'} onSelect={onSelect} />
      <button
        type="button"
        aria-label="Collapse the tool rail"
        title="Collapse the tool rail"
        className="flex h-8 w-10 items-center justify-center rounded-md text-ink-3 hover:bg-page hover:text-ink"
        onClick={onToggleCollapsed}
      >
        <Icon icon={ChevronsLeft} size={16} />
      </button>
    </nav>
  );
}
