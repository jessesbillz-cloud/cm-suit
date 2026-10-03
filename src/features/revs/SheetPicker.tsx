// A wall's plan sheet: the job's PDFs (data/revSheets), a search over names and folders, one pick. The picked sheet
// stays at the top; the first matches show and the search finds the rest. Tapping the picked one again clears it.
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useRevSheets, type RevSheet } from '../../data/revSheets.queries';
import { formatBytes } from '../../lib/format';
import { FIELD_LABEL } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';

const SHOWN = 8;

interface SheetPickerProps {
  projectId: string;
  value: string | null;
  onChange: (fileId: string | null) => void;
}

function matches(s: RevSheet, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w !== '');
  const text = `${s.name} ${s.folder}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

export function SheetPicker({ projectId, value, onChange }: SheetPickerProps) {
  const sheets = useRevSheets(projectId);
  const [q, setQ] = useState('');
  const all = sheets.data ?? [];
  const picked = all.find((s) => s.id === value);
  const found = all.filter((s) => s.id !== value && matches(s, q));
  const rows = [...(picked ? [picked] : []), ...found.slice(0, SHOWN)];
  const more = found.length - SHOWN;
  return (
    <div className={FIELD_LABEL} role="group" aria-label="Sheet">
      Sheet
      <SearchBox label="Search the job's PDFs" placeholder="Search PDFs" onChange={setQ} testId="rev-sheet-search" />
      {sheets.isPending ? <LoadingState label="Loading the job's PDFs" /> : null}
      {sheets.isError ? <ErrorState className="m-0" error={sheets.error} onRetry={() => void sheets.refetch()} /> : null}
      {sheets.isSuccess && rows.length === 0 ? <EmptyState icon={FileText} title={q ? 'No PDF matches.' : 'No PDFs on this job yet.'} /> : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-card font-normal" data-testid="rev-sheets">
          {rows.map((s) => {
            const on = s.id === value;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  data-testid="rev-sheet"
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left ${on ? 'bg-accent-soft/60' : 'hover:bg-page'}`}
                  onClick={() => {
                    onChange(on ? null : s.id);
                  }}
                >
                  <span
                    aria-hidden
                    className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent' : 'border-line-strong'}`}
                  >
                    {on ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1.5 break-words text-[13.5px] font-medium leading-5 text-ink">
                      <Icon icon={FileText} size={14} className="mt-[3px] shrink-0 text-ink-3" />
                      <span className="min-w-0 break-words">{s.name}</span>
                    </span>
                    <span className="block text-[12px] leading-4 text-ink-3">
                      {s.folder} · {formatBytes(s.size)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {more > 0 ? <span className="text-[12px] font-normal text-ink-3">{`${String(more)} more`}</span> : null}
    </div>
  );
}
