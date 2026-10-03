// The one plan-sheet picker, from the job's PDFs (data/revSheets): a wall's sheet in Revs setup, the sheet an OFS
// request's map starts on (the request form), and the sheet the map is drawn on. The picked one shows by name with
// Change; picking is a search over names and folders, the picked one on top, the first matches listed and the search
// finding the rest. Where no sheet is a choice (a wall's), tapping the picked one again clears it.
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useFile } from '../../data/queries';
import { useRevSheets, type RevSheet } from '../../data/revSheets.queries';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { FIELD_LABEL } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import { ErrorState, LoadingState } from '../../ui/States';

const SHOWN = 8;

interface SheetPickerProps {
  projectId: string;
  value: string | null;
  onChange: (fileId: string | null) => void;
  /** No sheet is a choice (a wall's sheet). A map always needs one. */
  clearable?: boolean | undefined;
}

function matches(s: RevSheet, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w !== '');
  const text = `${s.name} ${s.folder}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

interface SheetListProps {
  sheets: readonly RevSheet[];
  value: string | null;
  onTap: (sheet: RevSheet) => void;
}

function SheetList({ sheets, value, onTap }: SheetListProps) {
  const [q, setQ] = useState('');
  const picked = sheets.find((s) => s.id === value);
  const found = sheets.filter((s) => s.id !== value && matches(s, q));
  const rows = [...(picked ? [picked] : []), ...found.slice(0, SHOWN)];
  const more = found.length - SHOWN;
  return (
    <div className="flex flex-col gap-1.5">
      <SearchBox label="Search the job's PDFs" placeholder="Search PDFs" onChange={setQ} testId="rev-sheet-search" />
      {rows.length === 0 ? <p className="text-sm text-ink-2">{q ? 'No PDF matches.' : 'No PDFs on this job yet.'}</p> : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-card" data-testid="rev-sheets">
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
                    onTap(s);
                  }}
                >
                  <span
                    aria-hidden
                    className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent' : 'border-line-strong'}`}
                  >
                    {on ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[13.5px] font-medium leading-5 text-ink">{s.name}</span>
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
      {more > 0 ? <span className="text-[12px] text-ink-3">{`${String(more)} more`}</span> : null}
    </div>
  );
}

export function SheetPicker({ projectId, value, onChange, clearable = false }: SheetPickerProps) {
  const [changing, setChanging] = useState(false);
  const sheets = useRevSheets(projectId);
  const listed = sheets.data?.find((s) => s.id === value);
  // A sheet that isn't among my PDFs (moved, replaced) still shows its name.
  const file = useFile(value !== null && !sheets.isPending && !listed ? value : null);
  const name = listed?.name ?? file.data?.original_name ?? (sheets.isPending || file.isLoading ? '' : 'Plan sheet');
  const picking = value === null || changing;

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="Sheet" data-testid="sheet-field">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className={FIELD_LABEL}>Sheet</span>
        {value !== null ? (
          <Button
            size="sm"
            variant="quiet"
            data-testid="sheet-change"
            onClick={() => {
              setChanging(!changing);
            }}
          >
            {changing ? 'Keep' : 'Change'}
          </Button>
        ) : null}
      </div>
      {value !== null && !changing ? (
        <p className="flex items-start gap-2 text-sm text-ink">
          <Icon icon={FileText} size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <span className="wrap-anywhere" data-testid="sheet-name">
            {name}
          </span>
        </p>
      ) : null}
      {picking && sheets.isPending ? <LoadingState label="Loading the job's PDFs" /> : null}
      {picking && sheets.isError ? <ErrorState className="m-0" error={sheets.error} onRetry={() => void sheets.refetch()} /> : null}
      {picking && sheets.isSuccess ? (
        <SheetList
          sheets={sheets.data}
          value={value}
          onTap={(s) => {
            if (s.id !== value) {
              setChanging(false);
              onChange(s.id);
            } else if (clearable) {
              onChange(null);
            } else {
              setChanging(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
