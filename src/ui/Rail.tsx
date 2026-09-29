// The rail (SPEC §7.2): fixed width, the tools this person turned on (icon + name), Settings pinned at the bottom.
// A dark navy strip down the whole left edge with the product mark on top, so the white work area reads as the page.
// It collapses to a thin strip; nobody drags or resizes it.
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { FUTURE_NAME } from '../lib/brand';
import { BrandMark } from './BrandMark';
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
      className={`relative flex h-[60px] w-[80px] flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
        active ? 'bg-rail-active text-white' : 'text-rail-ink hover:bg-rail-hover hover:text-white'
      }`}
      onClick={() => {
        onSelect(tool);
      }}
    >
      {active ? <span aria-hidden="true" className="absolute left-0 top-3 h-9 w-[3px] rounded-r bg-accent" /> : null}
      <Icon icon={meta.icon} size={22} />
      <span className="text-[12px] font-medium leading-4">{meta.label}</span>
    </button>
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

export function Rail({ items, current, collapsed, onSelect, onToggleCollapsed }: RailProps) {
  if (collapsed) {
    return (
      <nav aria-label="Tools" className="flex w-5 shrink-0 flex-col items-center bg-rail pt-16">
        <button
          type="button"
          aria-label="Show the tool rail"
          title="Show the tool rail"
          className="flex h-8 w-5 items-center justify-center text-rail-ink hover:text-white"
          onClick={onToggleCollapsed}
        >
          <Icon icon={ChevronsRight} size={14} />
        </button>
      </nav>
    );
  }
  return (
    <nav aria-label="Tools" className="flex w-rail shrink-0 flex-col items-center bg-rail pb-2">
      <Mark />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto pt-2">
        {items.map((t) => (
          <RailButton key={t} tool={t} active={t === current} onSelect={onSelect} />
        ))}
      </div>
      <div className="mt-2 flex w-full flex-col items-center gap-1 border-t border-rail-line pt-2">
        <RailButton tool="settings" active={current === 'settings'} onSelect={onSelect} />
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
