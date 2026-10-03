// The markup tools: one button per inspected item (its color swatch and its name), then Move, Undo and Clear. Read-only,
// the same swatches as a legend. Big targets on a phone (44 px); names wrap, never cut.
import type { ReactNode } from 'react';
import { Eraser, Hand, Undo2, type LucideIcon } from 'lucide-react';
import { Icon } from '../../../ui/Icon';
import { HIGHLIGHT_OPACITY, MARKUP_COLORS, type MarkupColor } from '../../../lib/markup';

export interface MarkupItem {
  color: MarkupColor;
  name: string;
}

/** One mark color as the highlighter shows it (the legend's swatch); the request form and its cells use it too. */
export function Swatch({ color }: { color: MarkupColor }) {
  const hex = MARKUP_COLORS[color];
  return (
    <span aria-hidden className="relative h-5 w-7 shrink-0 overflow-hidden rounded border bg-white" style={{ borderColor: hex }}>
      <span className="absolute inset-0" style={{ backgroundColor: hex, opacity: HIGHLIGHT_OPACITY }} />
    </span>
  );
}

const BUTTON =
  'inline-flex items-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed';
const TOOL = `${BUTTON} h-11 shrink-0 justify-center sm:h-10`;
/** A color button grows with a long item name instead of cutting it. */
const COLOR = `${BUTTON} min-h-11 max-w-full py-1.5 text-left sm:min-h-10`;
const TOOL_IDLE = 'border-line-strong bg-card text-ink shadow-control hover:bg-card-head disabled:border-line disabled:text-ink-3 disabled:shadow-none';
const TOOL_ON = 'border-accent/40 bg-accent-soft text-accent';

interface ToolProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  pressed?: boolean | undefined;
  testId: string;
}

function Tool({ icon, label, onClick, disabled = false, pressed, testId }: ToolProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={`${TOOL} ${pressed === true ? TOOL_ON : TOOL_IDLE}`}
    >
      <Icon icon={icon} size={17} />
      {label}
    </button>
  );
}

function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}

interface MarkupBarProps {
  items: readonly MarkupItem[];
  /** The color one finger draws with; null while moving. */
  pen: MarkupColor | null;
  moving: boolean;
  canUndo: boolean;
  canClear: boolean;
  onPick: (color: MarkupColor) => void;
  onMove: () => void;
  onUndo: () => void;
  onClear: () => void;
}

export function MarkupBar({ items, pen, moving, canUndo, canClear, onPick, onMove, onUndo, onClear }: MarkupBarProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-line bg-card px-3 py-2.5 max-sm:border-t sm:border-b">
      <Row label="Colors">
        {items.map((it) => {
          const on = pen === it.color;
          return (
            <button
              key={it.color}
              type="button"
              aria-pressed={on}
              onClick={() => {
                onPick(it.color);
              }}
              data-testid={`markup-color-${String(it.color)}`}
              className={`${COLOR} ${on ? 'bg-card text-ink' : TOOL_IDLE}`}
              style={on ? { borderColor: MARKUP_COLORS[it.color], boxShadow: `inset 0 0 0 1px ${MARKUP_COLORS[it.color]}` } : undefined}
            >
              <Swatch color={it.color} />
              <span className="break-words leading-tight">{it.name}</span>
            </button>
          );
        })}
      </Row>
      <Row label="Tools">
        <Tool icon={Hand} label="Move" pressed={moving} onClick={onMove} testId="markup-move" />
        <Tool icon={Undo2} label="Undo" disabled={!canUndo} onClick={onUndo} testId="markup-undo" />
        <Tool icon={Eraser} label="Clear" disabled={!canClear} onClick={onClear} testId="markup-clear" />
      </Row>
    </div>
  );
}

/** Read-only: which color is which item. */
export function MarkupLegend({ items }: { items: readonly MarkupItem[] }) {
  return (
    <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1.5 border-line bg-card px-3 py-2.5 max-sm:border-t sm:border-b">
      {items.map((it) => (
        <li key={it.color} className="flex items-center gap-2 text-sm text-ink">
          <Swatch color={it.color} />
          <span className="break-words">{it.name}</span>
        </li>
      ))}
    </ul>
  );
}
