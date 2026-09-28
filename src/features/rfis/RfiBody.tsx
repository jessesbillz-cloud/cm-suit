// The RFI itself, one flat view (SPEC §7.4): the question, its photos, what else the originator filled in, and the
// architect's answer with its files. Nothing folds away.
import type { ReactNode } from 'react';
import type { RfiDetail } from '../../data/rfis.types';
import { formatDay, formatInZone } from '../../lib/dates';
import { impactKinds } from './model';
import { RfiFiles } from './RfiFiles';

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

/** What else the originator filled in; empty ones are left out. */
function Extras({ rows }: { rows: readonly [label: string, value: string][] }) {
  const shown = rows.filter(([, v]) => v !== '');
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm" data-testid="rfi-extras">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-2">{label}</dt>
          <dd className="whitespace-pre-wrap break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface RfiBodyProps {
  detail: RfiDetail;
  timeZone: string;
}

export function RfiBody({ detail, timeZone }: RfiBodyProps) {
  const r = detail.rfi;
  const possible = impactKinds(r.cost_impact, r.time_impact);
  return (
    <>
      <Section title="Question" testId="rfi-question-text">
        <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-ink">{r.question}</p>
        <RfiFiles rfiId={r.id} files={detail.photos} kind="photos" />
      </Section>
      <Extras
        rows={[
          ['Suggestion', r.suggestion],
          ['Reference', r.refs],
          ['Needed by', r.needed_by === null ? '' : formatDay(r.needed_by, 'EEE, MMM d')],
          ['Possible impact', possible],
        ]}
      />
      {r.answer !== null ? (
        <Section title="Answer" testId="rfi-answer">
          <div className="flex flex-col gap-2 rounded-md border border-line bg-card-head p-3">
            <p className="text-xs text-ink-2">
              {detail.answerer_name ?? 'Architect'}
              {r.answered_at !== null ? ` · ${formatInZone(r.answered_at, timeZone, 'MMM d, h:mm a')}` : ''}
            </p>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-ink">{r.answer}</p>
            <RfiFiles rfiId={r.id} files={detail.answer_files} kind="files" />
          </div>
        </Section>
      ) : null}
    </>
  );
}
