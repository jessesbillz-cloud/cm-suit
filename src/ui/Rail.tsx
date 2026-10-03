// The rail (SPEC §7.2; Jesse, Oct 1) in two parts. On top, always, the general things: Board and Calendar (and the bids
// pipeline and timesheets when they apply to me); with no job picked they cover all my jobs, with a job picked they act
// on it. Under them, only with a job picked: a divider, the job's name, the tools I chose for this job (each with a
// count of what needs me), More for the job's other tools, and Edit to choose them. Settings is pinned at the bottom.
// A dark navy strip down the whole left edge with the product mark on top; it collapses to icons only (the job's name
// becomes a thin divider). Nobody drags or resizes it.
import { useEffect, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Pencil } from 'lucide-react';
import { FUTURE_NAME } from '../lib/brand';
import type { RailTool, Tool } from '../lib/layout';
import type { ToolCounts } from '../lib/toolCounts';
import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import { JobToolsEdit, type JobToolsChoice } from './JobToolsEdit';
import { RailItem, RailMore } from './RailItem';
import { TOOL_META } from './tools';

/** The picked job's part of the rail. */
export interface RailJobPart {
  /** The job's name: the label over its tools. */
  label: string;
  /** Under the name, in my order for this job. */
  tools: readonly RailTool[];
  /** The job's other tools, under More. */
  more: readonly RailTool[];
  edit: JobToolsChoice;
  /** My saved list's version (null: none saved), so a test can wait for a save to land. */
  version: number | null;
}

interface RailProps {
  general: readonly RailTool[];
  /** null on All my jobs. */
  job: RailJobPart | null;
  counts: ToolCounts;
  current: Tool;
  collapsed: boolean;
  onSelect: (tool: Tool) => void;
  /** Hover or focus on a tool: start loading its code. */
  onPreload?: ((tool: Tool) => void) | undefined;
  onToggleCollapsed: () => void;
}

interface JobEditProps {
  label: string;
  choice: JobToolsChoice;
}

/** Edit, at the end of the job's part: which of the job's tools sit under its name, in a small panel beside the rail. */
function JobEdit({ label, choice }: JobEditProps) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
  };
  return (
    // Full width, so the panel opens just past the rail's edge (like More's menu).
    <div className="relative mt-0.5 flex w-full shrink-0 justify-center">
      <button
        type="button"
        data-testid="job-rail-edit"
        aria-label={`Edit ${label} tools`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium transition-colors ${
          open ? 'bg-rail-active text-white' : 'text-rail-ink hover:bg-rail-hover hover:text-white'
        }`}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Icon icon={Pencil} size={12} />
        Edit
      </button>
      {open ? (
        <>
          {/* Backdrop: clicking outside closes the panel without a document listener. */}
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={close} />
          <div
            ref={panel}
            role="dialog"
            aria-label={`${label} tools`}
            tabIndex={-1}
            data-testid="job-rail-editor"
            className="absolute bottom-0 left-full z-40 ml-1 max-h-[calc(100vh-1.5rem)] w-64 overflow-y-auto rounded-card bg-card shadow-pop outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
          >
            <p className="break-words border-b border-line px-3 py-2.5 text-sm font-semibold text-ink wrap-anywhere">{label}</p>
            <JobToolsEdit {...choice} onDone={close} />
          </div>
        </>
      ) : null}
    </div>
  );
}

interface ItemsProps {
  tools: readonly RailTool[];
  counts: ToolCounts;
  current: Tool;
  compact: boolean;
  onSelect: (tool: Tool) => void;
  onPreload?: ((tool: Tool) => void) | undefined;
}

function Items({ tools, counts, current, compact, onSelect, onPreload }: ItemsProps) {
  return (
    <>
      {tools.map((t) => (
        <RailItem
          key={t}
          testId={`rail-${t}`}
          label={TOOL_META[t].label}
          icon={TOOL_META[t].icon}
          count={counts[t] ?? 0}
          badgeId={`tool-badge-${t}`}
          active={t === current}
          compact={compact}
          onClick={() => {
            onSelect(t);
          }}
          onPreload={onPreload && (() => {
            onPreload(t);
          })}
        />
      ))}
    </>
  );
}

interface JobHeadProps {
  label: string;
  compact: boolean;
}

/** Where the job's part starts: a divider and the job's name (wrapped, never cut), or on the collapsed rail a thin line. */
function JobHead({ label, compact }: JobHeadProps) {
  if (compact) {
    return (
      <span
        aria-hidden="true"
        title={label}
        data-testid="job-rail-label"
        className="my-1.5 h-[3px] w-7 shrink-0 rounded-full bg-rail-ink/50"
      />
    );
  }
  return (
    <p
      aria-hidden="true"
      data-testid="job-rail-label"
      className="mt-2 w-[80px] shrink-0 text-balance break-words border-t border-rail-line px-1 pb-1 pt-2.5 text-center text-[11px] font-semibold uppercase leading-[14px] tracking-wide text-rail-ink wrap-anywhere"
    >
      {label}
    </p>
  );
}

export function Rail({ general, job, counts, current, collapsed, onSelect, onPreload, onToggleCollapsed }: RailProps) {
  const compact = collapsed;
  const items = { counts, current, compact, onSelect, onPreload };
  return (
    <nav aria-label="Tools" className={`flex shrink-0 flex-col items-center bg-rail pb-2 ${compact ? 'w-14' : 'w-rail'}`}>
      <div className="flex h-14 w-full shrink-0 items-center justify-center short:h-11" title={FUTURE_NAME}>
        <BrandMark size="md" />
      </div>
      <div className="flex min-h-0 w-full flex-col items-center gap-1 overflow-y-auto pt-2">
        <Items tools={general} {...items} />
        {job ? (
          <>
            <JobHead label={job.label} compact={compact} />
            <div
              role="group"
              aria-label={job.label}
              data-testid="job-rail"
              data-version={job.version ?? 'none'}
              className="flex w-full flex-col items-center gap-1"
            >
              <Items tools={job.tools} {...items} />
            </div>
          </>
        ) : null}
      </div>
      {/* More and Edit sit outside the scrolling list, so their panels beside the rail are never clipped. */}
      {job && job.more.length > 0 ? (
        <div className="mt-1 flex w-full shrink-0 justify-center">
          <RailMore tools={job.more} {...items} />
        </div>
      ) : null}
      {job && !compact ? <JobEdit label={job.label} choice={job.edit} /> : null}
      <div className="flex-1" />
      <div className="mt-2 flex w-full shrink-0 flex-col items-center gap-1 border-t border-rail-line pt-2">
        <RailItem
          testId="rail-settings"
          label={TOOL_META.settings.label}
          icon={TOOL_META.settings.icon}
          count={0}
          badgeId="tool-badge-settings"
          active={current === 'settings'}
          compact={compact}
          onClick={() => {
            onSelect('settings');
          }}
          onPreload={onPreload && (() => {
            onPreload('settings');
          })}
        />
        <button
          type="button"
          aria-label={compact ? 'Show the tool names' : 'Collapse the tool rail'}
          title={compact ? 'Show the tool names' : 'Collapse the tool rail'}
          className="flex h-7 w-10 items-center justify-center rounded-md text-rail-ink hover:bg-rail-hover hover:text-white"
          onClick={onToggleCollapsed}
        >
          <Icon icon={compact ? ChevronsRight : ChevronsLeft} size={16} />
        </button>
      </div>
    </nav>
  );
}
