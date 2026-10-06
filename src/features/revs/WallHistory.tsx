// A wall's history on its page (0083; Jesse, Oct 5: "keep the links to all the revs and previous inspections from that
// wall ... you can click on it and expand it over there on the right hand side to see the thing"): per item, every
// inspection, newest first. An in-app request: "IR 12 · OFS 0065 · Oct 2, 2026" and its result (a tap opens the
// request, beside the page on a desktop). Signed off before the app: "OFS 0041 · Aug 20, 2026 · Before app" and its
// note (a tap opens its OFS IR when one is on file). Items with none are left out.
import { useWallHistory, type HistoryRow } from '../../data/revs.history';
import { formatDay } from '../../lib/dates';
import { ErrorState } from '../../ui/States';
import { chipOf } from './model';
import type { WallItem } from './wallPage';

interface WallHistoryProps {
  projectId: string;
  areaId: string;
  items: readonly WallItem[];
  onRequest: (requestId: string) => void;
  onFile: (row: HistoryRow & { file_id: string }) => void;
}

const ofs = (n: number) => `OFS ${String(n).padStart(4, '0')}`;

function rowLine(r: HistoryRow): string {
  const parts: string[] = [];
  if (r.ir_number !== null) parts.push(`IR ${String(r.ir_number)}`);
  if (r.ofs_number !== null) parts.push(ofs(r.ofs_number));
  if (r.day !== null) parts.push(formatDay(r.day, 'MMM d, yyyy'));
  if (r.kind === 'before') parts.push('Before app');
  return parts.join(' · ');
}

function Row({ row, onRequest, onFile }: { row: HistoryRow } & Pick<WallHistoryProps, 'onRequest' | 'onFile'>) {
  const chip = chipOf(row.result);
  const fileId = row.file_id;
  const open =
    row.kind === 'request' && row.can_open && row.request_id !== null
      ? () => {
          if (row.request_id !== null) onRequest(row.request_id);
        }
      : row.kind === 'before' && fileId !== null
        ? () => {
            onFile({ ...row, file_id: fileId });
          }
        : null;
  const body = (
    <>
      <span className={`font-medium tabular-nums ${open ? 'text-accent' : 'text-ink'}`}>{rowLine(row)}</span>
      <span className="font-semibold" style={{ color: `var(--status-${chip.key}-fg)` }}>
        {chip.label}
      </span>
      {row.note ? <span className={`min-w-0 basis-full break-words ${row.result === 'failed' ? 'text-danger' : 'text-ink-2'}`}>{row.note}</span> : null}
    </>
  );
  const look = 'flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 text-left text-[13.5px] leading-5';
  return (
    <li data-testid="rev-history-row" data-kind={row.kind}>
      {open ? (
        <button type="button" className={`${look} hover:bg-accent-soft`} data-testid="rev-history-open" onClick={open}>
          {body}
        </button>
      ) : (
        <div className={look}>{body}</div>
      )}
    </li>
  );
}

export function WallHistory({ projectId, areaId, items, onRequest, onFile }: WallHistoryProps) {
  const history = useWallHistory(projectId, areaId);
  if (history.isError) return <ErrorState className="m-0" error={history.error} title="The history did not load." onRetry={() => void history.refetch()} />;
  const rows = history.data ?? [];
  const groups = items.map((i) => ({ item: i, rows: rows.filter((r) => r.item_id === i.item.id) })).filter((g) => g.rows.length > 0);
  if (groups.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="rev-history">
      <h2 className="px-1 text-[12px] font-semibold uppercase leading-5 tracking-[0.06em] text-ink-2">History</h2>
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <li key={g.item.item.id} className="flex flex-col gap-0.5" data-testid={`rev-history-${g.item.item.id}`}>
            <p className="break-words px-2 text-[12.5px] font-semibold text-ink-3">{`Rev ${String(g.item.rev.number)} · ${g.item.item.name}`}</p>
            <ul className="flex flex-col">
              {g.rows.map((r, i) => (
                <Row key={`${r.kind}:${r.request_id ?? String(i)}`} row={r} onRequest={onRequest} onFile={onFile} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
