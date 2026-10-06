// The job picker (SPEC §7.2): top-left, beside the Home mark. Recent jobs first, then type-to-find, and "New job".
// It only switches between jobs (Jesse, Oct 5): home is the mark (ui/BrandMark HomeMark), not an entry here. It only
// reports the pick; the frame keeps the current tool when switching (2 taps: open, pick).
import { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import type { MyProject } from '../data/types';
import { Icon } from './Icon';

interface JobPickerProps {
  projects: readonly MyProject[];
  recentIds: readonly string[];
  /** null = "All my jobs". */
  currentId: string | null;
  onPick: (projectId: string) => void;
  /** Opens the setup flow for a new job. */
  onNewJob: () => void;
}

interface Option {
  id: string;
  name: string;
  detail: string;
}

const ALL_JOBS_LABEL = 'All my jobs';

function orderJobs(projects: readonly MyProject[], recentIds: readonly string[]): MyProject[] {
  const rank = new Map(recentIds.map((id, i): [string, number] => [id, i]));
  return [...projects].sort((a, b) => {
    const ra = rank.get(a.project_id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.project_id) ?? Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
  });
}

function detailOf(p: MyProject): string {
  return [p.number, p.org_name].filter((s) => s).join(' · ');
}

interface OptionRowProps {
  option: Option;
  index: number;
  active: boolean;
  current: boolean;
  onHover: () => void;
  onChoose: () => void;
}

function OptionRow({ option, index, active, current, onHover, onChoose }: OptionRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={current}
      data-testid={`job-picker-option-${String(index)}`}
      className={`flex w-full items-start gap-2 px-3 py-2 text-left ${active ? 'bg-page' : ''}`}
      onMouseEnter={onHover}
      onClick={onChoose}
    >
      <span className="min-w-0 flex-1 wrap-anywhere">
        <span className="block text-sm text-ink">{option.name}</span>
        {option.detail ? <span className="block text-xs text-ink-2">{option.detail}</span> : null}
      </span>
      {current ? <Icon icon={Check} size={16} className="mt-0.5 text-accent" /> : null}
    </button>
  );
}

export function JobPicker({ projects, recentIds, currentId, onPick, onNewJob }: JobPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    return orderJobs(projects, recentIds)
      .filter((p) => q === '' || `${p.name} ${detailOf(p)}`.toLowerCase().includes(q))
      .map((p) => ({ id: p.project_id, name: p.name, detail: detailOf(p) }));
  }, [projects, recentIds, query]);

  const current = projects.find((p) => p.project_id === currentId);
  const label = currentId === null ? ALL_JOBS_LABEL : (current?.name ?? 'Pick a job');
  const sub = currentId === null ? `${String(projects.length)} ${projects.length === 1 ? 'job' : 'jobs'}` : current ? detailOf(current) : '';

  function close() {
    setOpen(false);
    setQuery('');
    setActive(0);
  }

  function choose(o: Option) {
    close();
    if (o.id !== currentId) onPick(o.id);
  }

  const rowProps = (o: Option, i: number): OptionRowProps => ({
    option: o,
    index: i,
    active: i === active,
    current: o.id === currentId,
    onHover: () => {
      setActive(i);
    },
    onChoose: () => {
      choose(o);
    },
  });

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="job-picker"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-11 max-w-[32rem] items-center gap-2 rounded-lg px-2.5 py-1 text-left text-ink hover:bg-page"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        {/* The whole job name, wrapped if it is long; never cut off. */}
        <span className="flex min-w-0 flex-col leading-tight wrap-anywhere">
          <span className="text-[15px] font-semibold">{label}</span>
          {sub ? <span className="text-xs text-ink-2">{sub}</span> : null}
        </span>
        <Icon icon={ChevronDown} size={16} className="shrink-0 text-ink-2" />
      </button>
      {open ? (
        <>
          {/* Backdrop: clicking outside closes the menu without a document listener. */}
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={close} />
          <div className="absolute left-0 top-full z-40 mt-1 w-80 rounded-card bg-card shadow-pop">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Icon icon={Search} size={16} className="text-ink-3" />
              <input
                autoFocus
                aria-label="Find a job"
                placeholder="Find a job"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, options.length - 1));
                  else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
                  else if (e.key === 'Escape') close();
                  else if (e.key === 'Enter') {
                    const o = options[active];
                    if (o) choose(o);
                  } else return;
                  e.preventDefault();
                }}
              />
            </div>
            <div role="listbox" aria-label="Jobs" className="py-1">
              <ul role="presentation" className="max-h-72 overflow-auto">
                {options.map((o, i) => (
                  <li key={o.id} role="presentation">
                    <OptionRow {...rowProps(o, i)} />
                  </li>
                ))}
                {options.length === 0 ? <li className="px-3 py-3 text-sm text-ink-2">No job matches.</li> : null}
              </ul>
            </div>
            <button
              type="button"
              data-testid="job-picker-new"
              className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-sm font-medium text-accent hover:bg-page"
              onClick={() => {
                close();
                onNewJob();
              }}
            >
              <Icon icon={Plus} size={16} />
              New job
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
