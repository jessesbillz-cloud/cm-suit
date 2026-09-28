// The job picker (SPEC §7.2): always top-left. Recent jobs first, then type-to-find, "All my jobs", and "New job".
// It only reports the pick; the frame keeps the current tool when switching (2 taps: open, pick).
import { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';
import type { MyProject } from '../data/types';
import { ALL_JOBS_TOOLS } from '../lib/jobs';
import { Icon } from './Icon';
import { TOOL_META } from './tools';

interface JobPickerProps {
  projects: readonly MyProject[];
  recentIds: readonly string[];
  /** null = "All my jobs". */
  currentId: string | null;
  onPick: (projectId: string | null) => void;
  /** Opens the setup flow for a new job. */
  onNewJob: () => void;
}

interface Option {
  id: string | null;
  name: string;
  detail: string;
}

const ALL_JOBS_LABEL = 'All my jobs';
/** "Board, Calendar, Bids": what "All my jobs" holds, from the one list of cross-job tools. */
const ALL_JOBS_DETAIL = ALL_JOBS_TOOLS.map((t) => TOOL_META[t].label).join(', ');

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

export function JobPicker({ projects, recentIds, currentId, onPick, onNewJob }: JobPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const jobs = orderJobs(projects, recentIds)
      .filter((p) => q === '' || `${p.name} ${detailOf(p)}`.toLowerCase().includes(q))
      .map((p) => ({ id: p.project_id, name: p.name, detail: detailOf(p) }));
    const all: Option = { id: null, name: ALL_JOBS_LABEL, detail: ALL_JOBS_DETAIL };
    return q === '' || ALL_JOBS_LABEL.toLowerCase().includes(q) ? [...jobs, all] : jobs;
  }, [projects, recentIds, query]);

  const current = projects.find((p) => p.project_id === currentId);
  const label = currentId === null ? ALL_JOBS_LABEL : (current?.name ?? 'Pick a job');

  function close() {
    setOpen(false);
    setQuery('');
    setActive(0);
  }

  function choose(o: Option) {
    close();
    if (o.id !== currentId) onPick(o.id);
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="job-picker"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 max-w-[18rem] items-center gap-2 rounded-md px-2.5 text-sm font-semibold text-ink hover:bg-page"
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
      >
        <span className="truncate">{label}</span>
        <Icon icon={ChevronDown} size={16} className="text-ink-2" />
      </button>
      {open ? (
        <>
          {/* Backdrop: clicking outside closes the menu without a document listener. */}
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={close} />
          <div className="absolute left-0 top-10 z-40 w-80 rounded-card bg-card shadow-pop">
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
            <ul role="listbox" aria-label="Jobs" className="max-h-80 overflow-auto py-1">
              {options.map((o, i) => (
                <li key={o.id ?? 'all'} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.id === currentId}
                    data-testid={`job-picker-option-${String(i)}`}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left ${i === active ? 'bg-page' : ''}`}
                    onMouseEnter={() => {
                      setActive(i);
                    }}
                    onClick={() => {
                      choose(o);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-ink">{o.name}</span>
                      {o.detail ? <span className="block text-xs text-ink-2">{o.detail}</span> : null}
                    </span>
                    {o.id === currentId ? <Icon icon={Check} size={16} className="mt-0.5 text-accent" /> : null}
                  </button>
                </li>
              ))}
              {options.length === 0 ? <li className="px-3 py-3 text-sm text-ink-2">No job matches.</li> : null}
            </ul>
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
