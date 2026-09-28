// A package's spec sections (SPEC §11.2): type a number or a title to find one, in the package's division or in all of
// them; picked sections sit below as chips ("09 21 16 Gypsum Board Assemblies") with an x to take one off.
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { CsiLibrary, CsiSection } from '../../data/csi.types';
import { searchSections } from '../../lib/csi';
import { Icon } from '../../ui/Icon';

const MAX_SHOWN = 60;

interface ScopeToggleProps {
  division: string;
  everywhere: boolean;
  onChange: (everywhere: boolean) => void;
}

function ScopeToggle({ division, everywhere, onChange }: ScopeToggleProps) {
  const choice = (label: string, value: boolean, testId: string) => (
    <button
      type="button"
      aria-pressed={everywhere === value}
      data-testid={testId}
      className={`h-full px-2.5 text-xs font-medium tabular-nums ${everywhere === value ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-page'}`}
      onClick={() => {
        onChange(value);
      }}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Search in" className="flex h-9 shrink-0 overflow-hidden rounded-md border border-line-strong">
      {choice(division, false, 'section-scope-division')}
      <span className="w-px bg-line-strong" aria-hidden="true" />
      {choice('All', true, 'section-scope-all')}
    </div>
  );
}

interface SectionOptionsProps {
  id: string;
  options: readonly CsiSection[];
  active: number;
  onHover: (index: number) => void;
  onPick: (number: string) => void;
}

function SectionOptions({ id, options, active, onHover, onPick }: SectionOptionsProps) {
  return (
    <ul id={id} role="listbox" aria-label="Sections" className="absolute inset-x-0 top-10 z-20 max-h-72 overflow-auto rounded-md bg-card py-1 shadow-pop">
      {options.map((s, i) => (
        <li key={s.number} role="presentation">
          <button
            type="button"
            role="option"
            id={`${id}-${String(i)}`}
            aria-selected={i === active}
            tabIndex={-1}
            data-testid={`section-option-${s.number}`}
            className={`flex w-full items-start gap-3 px-3 py-1.5 text-left text-sm ${i === active ? 'bg-page' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onMouseEnter={() => {
              onHover(i);
            }}
            onClick={() => {
              onPick(s.number);
            }}
          >
            <span className="w-[4.5rem] shrink-0 tabular-nums text-ink-2">{s.number}</span>
            <span className="min-w-0 flex-1 text-ink">{s.title}</span>
          </button>
        </li>
      ))}
      {options.length === 0 ? <li className="px-3 py-2 text-sm text-ink-2">No match.</li> : null}
    </ul>
  );
}

interface SectionChipsProps {
  value: readonly string[];
  titles: ReadonlyMap<string, string>;
  disabled: boolean;
  onRemove: (number: string) => void;
}

function SectionChips({ value, titles, disabled, onRemove }: SectionChipsProps) {
  if (value.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Spec sections" data-testid="section-chips">
      {value.map((n) => (
        <li
          key={n}
          data-testid={`section-chip-${n}`}
          className="flex max-w-full items-start gap-1.5 rounded-md border border-line bg-page py-1 pl-2 pr-1 text-xs"
        >
          <span className="tabular-nums text-ink-2">{n}</span>
          {titles.has(n) ? <span className="min-w-0 text-ink">{titles.get(n)}</span> : null}
          <button
            type="button"
            aria-label={`Remove ${n}`}
            disabled={disabled}
            className="-my-1 -mr-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-card hover:text-ink disabled:opacity-50"
            onClick={() => {
              onRemove(n);
            }}
          >
            <Icon icon={X} size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface SectionPickerProps {
  library: CsiLibrary;
  /** The package's division ('09'); null when its code has none, and then the search covers every division. */
  division: string | null;
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** While a save is on its way: chips can't be taken off (the search stays usable). */
  busy?: boolean | undefined;
}

export function SectionPicker({ library, division, value, onChange, busy = false }: SectionPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [everywhere, setEverywhere] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const titles = useMemo(() => new Map(library.sections.map((s) => [s.number, s.title])), [library]);

  const scope = everywhere || division === null ? null : division;
  const options = searchSections(library.sections, query, scope)
    .filter((s) => !value.includes(s.number))
    .slice(0, MAX_SHOWN);

  // The list closes on a pick so the new chip shows; typing or the down arrow opens it again.
  function pick(number: string) {
    onChange([...value, number].sort());
    setQuery('');
    setActive(0);
    setOpen(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      const o = open ? options[active] : undefined;
      if (o) pick(o.number);
    } else return;
    e.preventDefault();
  }

  return (
    <div className="flex flex-col gap-2 font-normal">
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon icon={Search} size={16} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-3" />
          <input
            role="combobox"
            aria-label="Find a section"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && options[active] ? `${listId}-${String(active)}` : undefined}
            aria-autocomplete="list"
            placeholder="Number or title"
            data-testid="package-section-search"
            className="h-9 w-full rounded-md border border-line-strong bg-card pl-8 pr-2.5 text-sm text-ink shadow-control outline-none placeholder:text-ink-3 focus:border-accent focus:ring-[3px] focus:ring-accent/20"
            value={query}
            onFocus={() => {
              setOpen(true);
            }}
            onClick={() => {
              setOpen(true);
            }}
            onBlur={() => {
              setOpen(false);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={onKey}
          />
          {open ? <SectionOptions id={listId} options={options} active={active} onHover={setActive} onPick={pick} /> : null}
        </div>
        {division !== null ? (
          <ScopeToggle
            division={division}
            everywhere={everywhere}
            onChange={(v) => {
              setEverywhere(v);
              setActive(0);
            }}
          />
        ) : null}
      </div>
      <SectionChips
        value={value}
        titles={titles}
        disabled={busy}
        onRemove={(n) => {
          onChange(value.filter((x) => x !== n));
        }}
      />
    </div>
  );
}
