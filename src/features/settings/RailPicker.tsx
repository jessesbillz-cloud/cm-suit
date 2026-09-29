// The rail in Settings: the tools I show, in my order (the phone bar takes the first ones), then the ones under More.
// Up/down buttons move a tool; no dragging. It starts as my position's tools; any change saves my own list (pins).
import { ChevronDown, ChevronUp, Smartphone, type LucideIcon } from 'lucide-react';
import { RAIL_TOOLS, moveRailItem, phoneTabs, showOnRail, type RailChoices, type RailTool } from '../../lib/layout';
import { Icon } from '../../ui/Icon';
import { TOOL_META } from '../../ui/tools';
import { pointAt, type Spot } from './LayoutPreview';

interface RailPickerProps {
  choices: RailChoices;
  onChange: (patch: Partial<RailChoices>) => void;
  onSpot: (spot: Spot | null) => void;
}

interface MoveProps {
  icon: LucideIcon;
  label: string;
  testId: string;
  disabled: boolean;
  onClick: () => void;
}

function MoveButton({ icon, label, testId, disabled, onClick }: MoveProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:text-line-strong disabled:hover:bg-transparent sm:h-8 sm:w-8"
      onClick={onClick}
    >
      <Icon icon={icon} size={16} />
    </button>
  );
}

interface RowProps {
  tool: RailTool;
  /** Place on the rail (0-based), or null when hidden. */
  place: number | null;
  count: number;
  onPhone: boolean;
  onShow: (shown: boolean) => void;
  onMove: (step: -1 | 1) => void;
  onSpot: (spot: Spot | null) => void;
}

function RailRow({ tool, place, count, onPhone, onShow, onMove, onSpot }: RowProps) {
  const { label, icon } = TOOL_META[tool];
  const shown = place !== null;
  // Pointer moves, not enters: after a move the rows shift under a still pointer, and the moved tool stays lit.
  // The list clears the spot when the pointer or focus leaves it (pointAt on the <ul>).
  const point = () => {
    onSpot({ area: 'rail', tool: shown ? tool : null });
  };
  return (
    <li
      data-testid={`layout-rail-row-${tool}`}
      data-shown={shown}
      className="flex h-12 items-center gap-2 pl-3 pr-1.5 transition-colors hover:bg-card-head sm:h-11"
      onMouseMove={point}
      onFocus={point}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 self-stretch">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-accent"
          data-testid={`layout-rail-show-${tool}`}
          checked={shown}
          // The rail never goes empty.
          disabled={shown && count === 1}
          onChange={(e) => {
            onShow(e.target.checked);
          }}
        />
        <span className="w-4 shrink-0 text-right text-xs tabular-nums text-ink-3">{shown ? place + 1 : ''}</span>
        <Icon icon={icon} size={18} className={`shrink-0 ${shown ? 'text-ink-2' : 'text-ink-3'}`} />
        <span className={`truncate text-sm ${shown ? 'text-ink' : 'text-ink-3'}`}>{label}</span>
      </label>
      {onPhone ? <Icon icon={Smartphone} size={14} label="On the phone bar" className="shrink-0 text-accent" /> : null}
      {shown ? (
        <div className="flex shrink-0">
          <MoveButton
            icon={ChevronUp}
            label={`Move ${label} up`}
            testId={`layout-rail-up-${tool}`}
            disabled={place === 0}
            onClick={() => {
              onMove(-1);
              point();
            }}
          />
          <MoveButton
            icon={ChevronDown}
            label={`Move ${label} down`}
            testId={`layout-rail-down-${tool}`}
            disabled={place === count - 1}
            onClick={() => {
              onMove(1);
              point();
            }}
          />
        </div>
      ) : (
        <span className="w-[72px] shrink-0 sm:w-16" />
      )}
    </li>
  );
}

export function RailPicker({ choices, onChange, onSpot }: RailPickerProps) {
  const items = choices.rail_items;
  const hidden = RAIL_TOOLS.filter((t) => !items.includes(t));
  const { tabs } = phoneTabs(items, choices.main_default);
  const row = (tool: RailTool, place: number | null) => (
    <RailRow
      key={tool}
      tool={tool}
      place={place}
      count={items.length}
      onPhone={place !== null && tabs.includes(tool)}
      onSpot={onSpot}
      onShow={(shown) => {
        onChange(showOnRail(choices, tool, shown));
      }}
      onMove={(step) => {
        onChange({ rail_items: moveRailItem(items, tool, step) });
      }}
    />
  );
  const { onMouseLeave, onBlur } = pointAt({ area: 'rail', tool: null }, onSpot);
  return (
    <ul
      data-testid="layout-rail"
      className="divide-y divide-line rounded-md border border-line bg-card"
      onMouseLeave={onMouseLeave}
      onBlur={onBlur}
    >
      {items.map((t, i) => row(t, i))}
      {hidden.map((t) => row(t, null))}
    </ul>
  );
}
