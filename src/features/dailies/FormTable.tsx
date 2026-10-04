// One table of a form's day (manpower, equipment, work performed, deliveries, crew ...): the column titles once, then a
// line per row (a long value, like the work or the material, on its own line under it), Add, and a row taken off with
// Undo instead of a question. Count and hours are number boxes, totaled in the title bar. An empty table is just its
// title and Add. A carry table's rows come back on the next report (numbers cleared).
import type { CSSProperties } from 'react';
import { Plus, X } from 'lucide-react';
import type { FormColumn, FormTable, TableRow } from '../../lib/dailies';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { Section } from './Section';
import { INPUT_EDGE } from './styles';

const MAX_ROWS = 200;
/** A text value allowed longer than this gets its own line. */
const WIDE_AFTER = 200;
/** A text value this short (a time, a quantity) gets a narrow box. */
const SHORT_UPTO = 40;
const CELL = `h-9 min-w-0 px-1.5 text-[13px] ${INPUT_EDGE}`;

function isWide(c: FormColumn): boolean {
  return c.multiline === true || c.max > WIDE_AFTER;
}

/** The line's columns: a number 3rem, a short value 5.25rem, the rest by weight. */
function lineStyle(cols: readonly FormColumn[]): CSSProperties {
  const tracks = cols.map((c) => (c.number ? '3rem' : c.max <= SHORT_UPTO ? '5.25rem' : `minmax(0, ${String(c.w ?? 1)}fr)`));
  return { gridTemplateColumns: tracks.join(' ') };
}

/** Numbers as typed: digits and one point. */
function numberText(v: string): string {
  const [whole = '', ...rest] = v.replace(/[^0-9.]/g, '').split('.');
  return rest.length > 0 ? `${whole}.${rest.join('')}` : whole;
}

/** The totals: "Count 6 · Hours 47.5", or null when no number was typed. */
function totalsLine(table: FormTable, rows: readonly TableRow[]): string | null {
  const parts = table.columns
    .filter((c) => c.number)
    .map((c) => {
      const values = rows
        .map((r) => (r.cells[c.key] ?? '').trim())
        .filter((v) => v !== '')
        .map(Number)
        .filter((n) => Number.isFinite(n));
      return values.length === 0 ? null : `${c.label} ${String(Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100)}`;
    })
    .filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

interface CellProps {
  table: string;
  col: FormColumn;
  value: string;
  locked: boolean;
  onChange: (value: string) => void;
}

function Cell({ table, col, value, locked, onChange }: CellProps) {
  const common = {
    'aria-label': col.label,
    maxLength: col.max,
    value,
    disabled: locked,
    'data-testid': `form-cell-${table}-${col.key}`,
  };
  if (col.multiline) {
    return (
      <textarea
        {...common}
        rows={2}
        placeholder={col.label}
        className={`w-full min-w-0 px-1.5 py-1.5 text-[13px] ${INPUT_EDGE}`}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    );
  }
  return (
    <input
      {...common}
      placeholder={isWide(col) ? col.label : undefined}
      inputMode={col.number ? 'decimal' : undefined}
      className={`${CELL} ${col.number ? 'text-right tabular-nums' : ''} ${isWide(col) ? 'w-full' : ''}`}
      onChange={(e) => {
        onChange(col.number ? numberText(e.target.value) : e.target.value);
      }}
    />
  );
}

interface FormTableProps {
  table: FormTable;
  rows: readonly TableRow[];
  locked: boolean;
  onRows: (change: (rows: TableRow[]) => TableRow[]) => void;
}

export function FormTableSection({ table, rows, locked, onRows }: FormTableProps) {
  const toast = useToast();
  const canAdd = !locked && rows.length < MAX_ROWS;
  if (rows.length === 0 && !canAdd) return null;
  const line = table.columns.filter((c) => !isWide(c));
  const wide = table.columns.filter(isWide);
  const style = lineStyle(line);
  const totals = totalsLine(table, rows);

  function add() {
    // The key only identifies the row inside its table; the database never uses it as an id.
    onRows((list) => [...list, { key: crypto.randomUUID(), ref: null, carry: table.carry === true, cells: {} }]);
  }

  function remove(index: number) {
    const gone = rows[index];
    if (!gone) return;
    onRows((list) => list.filter((r) => r.key !== gone.key));
    toast.show({
      message: 'Row removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          onRows((list) => [...list.slice(0, index), gone, ...list.slice(index)]);
        },
      },
    });
  }

  const addButton = canAdd ? (
    <Button size="sm" icon={Plus} data-testid={`form-add-${table.key}`} onClick={add}>
      Add
    </Button>
  ) : null;

  if (rows.length === 0) return <Section title={table.label} testId={`form-table-${table.key}`} actions={addButton} />;

  return (
    <Section
      title={table.label}
      count={rows.length}
      testId={`form-table-${table.key}`}
      actions={
        <>
          {totals === null ? null : (
            <span className="text-sm font-medium tabular-nums text-ink-2" data-testid={`form-table-${table.key}-total`}>
              {totals}
            </span>
          )}
          {addButton}
        </>
      }
    >
      <div className="flex items-end gap-1 pb-1">
        <div className="grid min-w-0 flex-1 gap-1.5 text-xs font-medium text-ink-2" style={style} aria-hidden>
          {line.map((c) => (
            <span key={c.key} className={c.number ? 'text-right' : ''}>
              {c.label}
            </span>
          ))}
        </div>
        {locked ? null : <span className="w-8 shrink-0" />}
      </div>
      <ul className={wide.length > 0 ? 'divide-y divide-line' : 'flex flex-col gap-1.5'}>
        {rows.map((row, i) => (
          <li
            key={row.key}
            className={`flex items-start gap-1 ${wide.length > 0 ? 'py-2 first:pt-0 last:pb-0' : ''}`}
            data-testid={`form-row-${table.key}`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="grid gap-1.5" style={style}>
                {line.map((col) => (
                  <Cell
                    key={col.key}
                    table={table.key}
                    col={col}
                    value={row.cells[col.key] ?? ''}
                    locked={locked}
                    onChange={(value) => {
                      onRows((list) => list.map((r) => (r.key === row.key ? { ...r, cells: { ...r.cells, [col.key]: value } } : r)));
                    }}
                  />
                ))}
              </div>
              {wide.map((col) => (
                <Cell
                  key={col.key}
                  table={table.key}
                  col={col}
                  value={row.cells[col.key] ?? ''}
                  locked={locked}
                  onChange={(value) => {
                    onRows((list) => list.map((r) => (r.key === row.key ? { ...r, cells: { ...r.cells, [col.key]: value } } : r)));
                  }}
                />
              ))}
            </div>
            {locked ? null : (
              <button
                type="button"
                aria-label="Remove row"
                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-page hover:text-ink"
                onClick={() => {
                  remove(i);
                }}
              >
                <Icon icon={X} size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
