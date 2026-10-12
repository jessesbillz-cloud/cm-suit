// The spec book's sections as boxes, with a search box over them (Jesse, Oct 12: "type in the numbers, and clickable
// boxes on the left populate with which section you want to go to ... it kind of cascades open and everything is
// clickable"). Divisions ("09 Finishes") open to show their sections; typing shows only the matching ones, their
// divisions open. A box goes to that section's first page, never to every place it is mentioned. Enter goes to the
// first match. The section the reader is in is marked, and its division opens.
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCsiLibrary } from '../../data/csi.queries';
import type { SpecBookSection } from '../../data/specs';
import { Icon } from '../../ui/Icon';
import { findSections, type DivisionGroup } from './findSections';

interface SectionFinderProps {
  sections: readonly SpecBookSection[];
  /** The section the reader is in (-1 before the first). */
  at: number;
  /** Go to a page (a section's first). */
  onPick: (page: number) => void;
  autoFocus?: boolean | undefined;
}

const BOX =
  'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

interface DivisionProps {
  group: DivisionGroup;
  open: boolean;
  at: number;
  onToggle: () => void;
  onPick: (page: number) => void;
}

function Division({ group, open, at, onToggle, onPick }: DivisionProps) {
  return (
    <li>
      <button type="button" data-testid="spec-division" aria-expanded={open} className={`${BOX} bg-white/10 font-semibold text-white hover:bg-white/15`} onClick={onToggle}>
        <Icon icon={open ? ChevronDown : ChevronRight} size={16} className="mt-0.5 shrink-0 text-white/70" />
        <span className="tabular-nums">{group.division}</span>
        <span className="min-w-0 flex-1 wrap-anywhere">{group.title}</span>
      </button>
      {open ? (
        <ul className="mt-1.5 flex flex-col gap-1.5 pl-3">
          {group.sections.map((s) => {
            const here = s.index === at;
            return (
              <li key={`${s.section}-${String(s.first_page)}`}>
                <button
                  type="button"
                  data-testid="spec-section-box"
                  aria-current={here ? 'true' : undefined}
                  className={`${BOX} ${here ? 'bg-accent text-white' : 'bg-white/5 text-white/90 hover:bg-white/15'}`}
                  onClick={() => {
                    onPick(s.first_page);
                  }}
                >
                  <span className="shrink-0 font-semibold tabular-nums">{s.section}</span>
                  <span className="min-w-0 flex-1 wrap-anywhere">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/** A set with `key` added, or taken out when it was in. */
function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

const divisionOf = (section: string | undefined) => section?.replace(/\D/g, '').slice(0, 2) ?? '';

export function SectionFinder({ sections, at, onPick, autoFocus = false }: SectionFinderProps) {
  const csi = useCsiLibrary();
  const [query, setQuery] = useState('');
  // Browsing: the divisions opened (the reader's own, each time the reader comes into one, and those opened by hand).
  // Searching: every matching division is open, less the ones closed by hand.
  const mine = divisionOf(sections[at]?.section);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([mine]));
  const [shut, setShut] = useState<ReadonlySet<string>>(new Set());
  const [lastMine, setLastMine] = useState(mine);
  if (lastMine !== mine) {
    setLastMine(mine);
    setOpened((was) => new Set([...was, mine]));
  }
  const divisions = csi.data?.divisions;
  const found = findSections(sections, query, (d) => divisions?.find((x) => x.number === d)?.title ?? null);
  const searching = query.trim() !== '';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <input
        type="search"
        aria-label="Find a section"
        placeholder="Find a section"
        data-testid="spec-find"
        autoFocus={autoFocus}
        enterKeyHint="go"
        value={query}
        className="h-10 w-full shrink-0 rounded-lg bg-white/10 px-3 text-[15px] text-white outline-none placeholder:text-white/60 focus:bg-white/20"
        onChange={(e) => {
          setQuery(e.target.value);
          setShut(new Set());
        }}
        onKeyDown={(e) => {
          // The viewer's own keys (left / right between files) stay out of the box.
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
          if (e.key === 'Enter' && found.first) onPick(found.first.first_page);
        }}
      />
      {searching && found.groups.length === 0 ? <p className="px-1 text-sm text-white/80">No section matches.</p> : null}
      <ul data-testid="spec-sections" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto overscroll-contain">
        {found.groups.map((g) => (
          <Division
            key={g.division}
            group={g}
            open={searching ? !shut.has(g.division) : opened.has(g.division)}
            at={at}
            onPick={onPick}
            onToggle={() => {
              if (searching) setShut((was) => toggled(was, g.division));
              else setOpened((was) => toggled(was, g.division));
            }}
          />
        ))}
      </ul>
    </div>
  );
}
