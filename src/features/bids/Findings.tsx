// Extraction findings as one flat list (SPEC §11.6). No money here: that is PricingLines, for pricing roles only.
import type { ReactNode } from 'react';
import type { ExtractionRow } from '../../data/bids.types';
import { formatDay } from '../../lib/dates';
import { humanize } from '../../lib/format';

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function List({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <span className="text-ink-3">None</span>;
  return (
    <ul className="list-disc pl-4">
      {items.map((t, i) => (
        <li key={`${String(i)}-${t}`}>{t}</li>
      ))}
    </ul>
  );
}

interface FindingsProps {
  x: ExtractionRow;
  /** A draft being corrected: bidder, date, PW and valid days are in the form instead (the PW evidence stays here). */
  editing?: boolean | undefined;
}

export function Findings({ x, editing = false }: FindingsProps) {
  const dash = '-';
  return (
    <dl className="divide-y divide-line text-sm" data-testid="bid-findings">
      {editing ? null : <Line label="Bidder">{x.bidder_name ?? dash}</Line>}
      {editing ? null : <Line label="Date">{x.bid_date !== null ? formatDay(x.bid_date, 'M/d/yy') : dash}</Line>}
      <Line label="Kind">{x.document_kind ?? dash}</Line>
      {editing && !x.prevailing_wage_evidence ? null : (
        <Line label="PW">
          {editing ? null : x.prevailing_wage ? humanize(x.prevailing_wage) : dash}
          {x.prevailing_wage_evidence ? <q className="block text-xs text-ink-2">{x.prevailing_wage_evidence}</q> : null}
        </Line>
      )}
      {editing ? null : <Line label="Valid">{x.validity_days !== null ? `${String(x.validity_days)} days` : dash}</Line>}
      <Line label="Scope">{x.scope_summary ?? dash}</Line>
      <Line label="Includes">
        <List items={x.inclusions} />
      </Line>
      <Line label="Excludes">
        <List items={x.exclusions} />
      </Line>
      <Line label="Terms">
        <List items={x.notable_terms} />
      </Line>
      <Line label="Match">{x.project_match ? humanize(x.project_match) : dash}</Line>
      <Line label="Confidence">{x.confidence !== null ? `${String(Math.round(x.confidence * 100))}%` : dash}</Line>
    </dl>
  );
}
