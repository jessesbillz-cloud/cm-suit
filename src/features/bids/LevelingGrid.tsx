// The leveling grid for one package (SPEC §11.6 "leveling grid"): every bidder's current price side by side with
// what is wrong. Evidence on hover over the amount; a row click opens the bid on the right. Money columns exist
// only when the caller has pricing (the board carries no amounts otherwise). Superseded, duplicate and backup rows
// sit below, greyed, naming what replaced them.
import type { FlagRow, LevelingRow } from '../../data/bids.types';
import { formatDay } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import { StatusChip } from '../../ui/StatusChip';
import { flagChip, pwLabel, splitRows, stateLabel } from './leveling';
import { OPEN_BAR, ROW_HOVER, ROW_OPEN, TH as HEAD } from './rowStyles';

interface LevelingGridProps {
  rows: readonly LevelingRow[];
  byRow: ReadonlyMap<string, FlagRow[]>;
  /** Pricing access is 'yes': the Base column renders. */
  money: boolean;
  lowId: string | null;
  selectedId: string | null;
  onOpen: (submissionId: string) => void;
}

const TH = 'px-2 py-2.5 font-medium';

function Flags({ flags }: { flags: readonly FlagRow[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f, i) => {
        const chip = flagChip(f);
        return <StatusChip key={`${f.kind}-${String(i)}`} status={chip.status} label={chip.label} />;
      })}
    </span>
  );
}

function Amount({ r }: { r: LevelingRow }) {
  if (r.base_amount === null) return <span className="text-ink-3">-</span>;
  const title = r.base_evidence === null ? undefined : `${r.base_evidence}${r.base_page !== null ? ` (p. ${String(r.base_page)})` : ''}`;
  return (
    <span title={title} className="font-semibold tabular-nums text-ink">
      {formatMoney(r.base_amount)}
    </span>
  );
}

export function LevelingGrid({ rows, byRow, money, lowId, selectedId, onOpen }: LevelingGridProps) {
  const { main, below } = splitRows(rows);
  const nameOf = (id: string | null) => rows.find((r) => r.submission_id === id);
  const rowClass = (r: LevelingRow, dim: boolean) =>
    `border-b border-line align-top ${r.submission_id === selectedId ? `cursor-pointer ${ROW_OPEN}` : ROW_HOVER} ${dim ? 'text-ink-3' : 'text-ink'}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="leveling-grid">
        <thead>
          <tr className={`border-b border-line text-left ${HEAD}`}>
            <th className={`${TH} pl-4`}>Bidder</th>
            <th className={`${TH} w-16`}>Date</th>
            {money ? <th className={`${TH} w-28 text-right`}>Base</th> : null}
            <th className={`${TH} w-20`}>PW</th>
            <th className={`${TH} w-20`}>Valid until</th>
            <th className={TH}>Exclusions</th>
            <th className={`${TH} pr-4`}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {main.map((r) => (
            <tr key={r.submission_id} data-testid={`leveling-row-${r.receipt_number}`} className={rowClass(r, r.state !== 'current')} onClick={() => {
                onOpen(r.submission_id);
              }}
            >
              <td className={`whitespace-normal break-words py-2.5 pl-4 pr-2 ${r.submission_id === selectedId ? OPEN_BAR : ''}`}>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span>{r.bidder}</span>
                  {r.submission_id === lowId ? <StatusChip status="confirmed" label="Low" /> : null}
                  {r.state === 'not_comparable' ? <StatusChip status="cancelled" label={stateLabel(r.state)} /> : null}
                  {r.is_late ? <StatusChip status="postponed" label="Late" /> : null}
                </span>
              </td>
              <td className="px-2 py-2 tabular-nums">{formatDay(r.bid_date, 'M/d/yy')}</td>
              {money ? (
                <td className="px-2 py-2 text-right">
                  <Amount r={r} />
                </td>
              ) : null}
              <td className="px-2 py-2">{pwLabel(r.prevailing_wage)}</td>
              <td className="px-2 py-2 tabular-nums">{r.valid_until === null ? '-' : formatDay(r.valid_until, 'M/d/yy')}</td>
              <td className="whitespace-normal break-words px-2 py-2 text-xs text-ink-2">{r.exclusions.join('; ')}</td>
              <td className="py-2 pl-2 pr-4">
                <Flags flags={byRow.get(r.submission_id) ?? []} />
              </td>
            </tr>
          ))}
          {below.map((r) => {
            const by = nameOf(r.replaced_by);
            return (
              <tr key={r.submission_id} data-testid={`leveling-row-${r.receipt_number}`} className={rowClass(r, true)} onClick={() => {
                  onOpen(r.submission_id);
                }}
              >
                <td className={`whitespace-normal break-words py-2.5 pl-4 pr-2 ${r.submission_id === selectedId ? OPEN_BAR : ''}`}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>{r.bidder}</span>
                    <StatusChip status="cancelled" label={stateLabel(r.state)} />
                  </span>
                </td>
                <td className="px-2 py-2 tabular-nums">{formatDay(r.bid_date, 'M/d/yy')}</td>
                {money ? (
                  <td className="px-2 py-2 text-right tabular-nums">{r.base_amount === null ? '-' : formatMoney(r.base_amount)}</td>
                ) : null}
                <td className="px-2 py-2">{pwLabel(r.prevailing_wage)}</td>
                <td className="px-2 py-2 tabular-nums">{r.valid_until === null ? '-' : formatDay(r.valid_until, 'M/d/yy')}</td>
                <td className="whitespace-normal break-words px-2 py-2 text-xs">{by ? `Replaced by ${by.bidder}, ${formatDay(by.bid_date, 'M/d/yy')}` : ''}</td>
                <td className="py-2 pl-2 pr-4">
                  <Flags flags={byRow.get(r.submission_id) ?? []} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
