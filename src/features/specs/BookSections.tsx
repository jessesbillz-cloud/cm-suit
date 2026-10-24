// One spec volume's sections under their division headings (Jesse, Oct 23: "click Volume 1 and the right side expands
// into the sections"). The headings always show, the sections under them; a section row opens it in the main column.
// The open section is marked and kept in view.
import { useEffect, useRef } from 'react';
import type { SpecBookSection } from '../../data/specs';
import { FOCUS_RING } from '../../ui/box';
import type { DivisionGroup } from './findSections';

interface BookSectionsProps {
  groups: readonly DivisionGroup[];
  /** The open section's first page in this volume; null when none of its sections is open. */
  at: number | null;
  onPick: (s: Pick<SpecBookSection, 'section' | 'title' | 'first_page'>) => void;
}

const ROW = `flex w-full items-baseline gap-3 py-2 pl-5 pr-4 text-left text-[14px] leading-5 ${FOCUS_RING} focus-visible:-outline-offset-2`;

export function BookSections({ groups, at, onPick }: BookSectionsProps) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: 'nearest' });
  }, [at]);
  return (
    <div className="flex flex-col pb-2">
      {groups.map((g) => (
        <section key={g.division} data-testid="spec-group" aria-label={`Division ${g.division}`}>
          <h3
            data-testid="spec-division"
            className="heading mx-4 mt-4 flex items-baseline gap-2 border-b-2 border-ink pb-1 text-[14px] font-semibold text-ink"
          >
            <span className="tabular-nums">{g.division}</span>
            <span className="min-w-0 flex-1 wrap-anywhere">{g.title}</span>
          </h3>
          <ul className="mt-1">
            {g.sections.map((s) => {
              const here = s.first_page === at;
              return (
                <li key={`${s.section}-${String(s.first_page)}`}>
                  <button
                    ref={here ? current : undefined}
                    type="button"
                    data-testid="spec-section-box"
                    aria-current={here ? 'true' : undefined}
                    className={`${ROW} ${here ? 'bg-accent-soft shadow-[inset_4px_0_0_theme(colors.accent.DEFAULT)]' : 'hover:bg-page/70 hover:shadow-[inset_4px_0_0_theme(colors.ink.DEFAULT)]'}`}
                    onClick={() => {
                      onPick(s);
                    }}
                  >
                    <span className={`w-[5.75rem] shrink-0 font-semibold tabular-nums ${here ? 'text-accent' : 'text-ink'}`}>{s.section}</span>
                    <span className="min-w-0 flex-1 text-ink wrap-anywhere">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
