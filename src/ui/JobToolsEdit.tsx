// Which tools sit under a job's name on the rail, and in what order (Jesse, Oct 1: "customizable within the job"). A box
// shows or hides a tool (a hidden one stays under More); the arrows move it. Each change saves at once; "Recommended"
// goes back to my position's list. The desktop rail opens it beside the job; the phone opens it from More.
import { ChevronDown, ChevronUp, RotateCcw, type LucideIcon } from 'lucide-react';
import { showJobTool } from '../lib/jobs';
import { moveRailItem, type RailTool } from '../lib/layout';
import { Button } from './Button';
import { Icon } from './Icon';
import { TOOL_META } from './tools';

export interface JobToolsChoice {
  /** Every tool the job has on (its own Board and Calendar too). */
  tools: readonly RailTool[];
  /** The ones under the job's name, in my order. */
  chosen: readonly RailTool[];
  /** I chose this job's list myself (else it is my position's recommendation). */
  own: boolean;
  /** A new list; null = back to my position's recommendation. */
  onChange: (chosen: readonly RailTool[] | null) => void;
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
  /** Place under the job's name (0-based), or null when it is under More. */
  place: number | null;
  last: boolean;
  onShow: (shown: boolean) => void;
  onMove: (step: -1 | 1) => void;
}

function ToolRow({ tool, place, last, onShow, onMove }: RowProps) {
  const { label, icon } = TOOL_META[tool];
  const shown = place !== null;
  return (
    <li data-testid={`job-tool-${tool}`} data-shown={shown} className="flex h-12 items-center gap-2 pl-3 pr-1.5 sm:h-11">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 self-stretch">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-accent"
          data-testid={`job-tool-show-${tool}`}
          checked={shown}
          onChange={(e) => {
            onShow(e.target.checked);
          }}
        />
        <Icon icon={icon} size={18} className={`shrink-0 ${shown ? 'text-ink-2' : 'text-ink-3'}`} />
        <span className={`min-w-0 break-words text-sm ${shown ? 'text-ink' : 'text-ink-3'}`}>{label}</span>
      </label>
      {shown ? (
        <div className="flex shrink-0">
          <MoveButton
            icon={ChevronUp}
            label={`Move ${label} up`}
            testId={`job-tool-up-${tool}`}
            disabled={place === 0}
            onClick={() => {
              onMove(-1);
            }}
          />
          <MoveButton
            icon={ChevronDown}
            label={`Move ${label} down`}
            testId={`job-tool-down-${tool}`}
            disabled={last}
            onClick={() => {
              onMove(1);
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

interface JobToolsEditProps extends JobToolsChoice {
  onDone: () => void;
}

/** The job's tools: the chosen ones first, in my order, then the rest; Recommended (once I have my own) and Done. */
export function JobToolsEdit({ tools, chosen, own, onChange, onDone }: JobToolsEditProps) {
  // One keyed list, so a tool that is shown or hidden moves (and keeps focus) instead of being drawn anew.
  const order = [...chosen, ...tools.filter((t) => !chosen.includes(t))];
  return (
    // The list scrolls on a short screen; Recommended and Done stay in view.
    <div data-testid="job-tools-edit" data-own={own} className="flex min-h-0 flex-col">
      <ul className="min-h-0 divide-y divide-line overflow-y-auto">
        {order.map((tool, i) => (
          <ToolRow
            key={tool}
            tool={tool}
            place={i < chosen.length ? i : null}
            last={i === chosen.length - 1}
            onShow={(shown) => {
              onChange(showJobTool(chosen, tool, shown));
            }}
            onMove={(step) => {
              onChange(moveRailItem(chosen, tool, step));
            }}
          />
        ))}
      </ul>
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-2">
        {own ? (
          <Button
            size="sm"
            variant="quiet"
            icon={RotateCcw}
            data-testid="job-tools-recommended"
            onClick={() => {
              onChange(null);
            }}
          >
            Recommended
          </Button>
        ) : null}
        <Button size="sm" className="ml-auto" data-testid="job-tools-done" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
