// The permit page's header: what it is (kind, OSFM's code for its stage, the job on the caseload), the number and the
// WHOLE title, and one action: open it alone in its own window. Then the facts that matter, empty ones left out: other
// numbers, who handles it, issued, expires (red once past) with extensions, notes; "Edit" for the official.
import type { ReactNode } from 'react';
import { ExternalLink, Pencil, Stamp } from 'lucide-react';
import type { PermitDetail } from '../../data/permits.types';
import { formatDay } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { expiry, kindLabel, stageCode, stageLabel } from './model';

interface PermitHeadProps {
  detail: PermitDetail;
  showJob: boolean;
  /** Leave out where there are no windows (the phone, or already alone in one). */
  onOpenWindow?: (() => void) | undefined;
  isPhone: boolean;
}

export function PermitHead({ detail, showJob, onOpenWindow, isPhone }: PermitHeadProps) {
  const p = detail.permit;
  const code = stageCode(p.stage);
  return (
    <header className="border-b border-line px-5 pb-3.5 pt-3">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
        <Icon icon={Stamp} size={16} className="text-accent" />
        <span>{kindLabel(p.kind)}</span>
        {showJob ? <span className="text-ink-3">· {detail.project_name}</span> : null}
        <span className="ml-auto flex items-center gap-2">
          <span data-testid="permit-stage" className="text-ink">
            {stageLabel(p.stage)}
          </span>
          {code ? (
            <span title="OSFM status" className="rounded border border-line px-1 font-mono text-[11.5px] font-semibold tracking-wide">
              {code}
            </span>
          ) : null}
          {onOpenWindow ? (
            <Button size={isPhone ? 'md' : 'sm'} variant="quiet" icon={ExternalLink} aria-label="Open in new window" title="Open in new window" onClick={onOpenWindow} />
          ) : null}
        </span>
      </div>
      <h1 className="mt-1 break-words text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink" data-testid="permit-title-text">
        <span className="mr-2 tabular-nums">{p.primary_number}</span>
        {p.title}
      </h1>
    </header>
  );
}

interface FactProps {
  label: string;
  children: ReactNode;
  testId?: string | undefined;
}

function Fact({ label, children, testId }: FactProps) {
  return (
    <div className="flex min-w-0 gap-2" data-testid={testId}>
      <dt className="w-24 shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

interface PermitFactsProps {
  detail: PermitDetail;
  now: Date;
  onEdit?: (() => void) | undefined;
}

export function PermitFacts({ detail, now, onEdit }: PermitFactsProps) {
  const p = detail.permit;
  const exp = expiry(p, detail.timezone, now);
  return (
    <div className="flex items-start gap-3">
      <dl className="flex min-w-0 flex-1 flex-col gap-1 text-[13.5px] leading-5" data-testid="permit-facts">
        {p.agency_numbers.length > 0 ? <Fact label="Other numbers">{p.agency_numbers.join(', ')}</Fact> : null}
        {detail.assigned_name ? <Fact label="Assigned">{detail.assigned_name}</Fact> : null}
        {p.issued_on ? <Fact label="Issued">{formatDay(p.issued_on, 'MMM d, yyyy')}</Fact> : null}
        {exp ? (
          <Fact label={exp.late ? 'Expired' : 'Expires'} testId="permit-expires">
            <span className={exp.late ? 'font-semibold' : ''} style={exp.late ? { color: 'var(--status-late-fg)' } : undefined}>
              {exp.date}
            </span>
            {p.extensions > 0 ? <span className="text-ink-2"> · {p.extensions === 1 ? '1 extension' : '2 extensions'}</span> : null}
          </Fact>
        ) : null}
        {p.notes ? <Fact label="Notes">{p.notes}</Fact> : null}
      </dl>
      {onEdit ? (
        <Button size="sm" variant="quiet" icon={Pencil} data-testid="permit-edit" onClick={onEdit}>
          Edit
        </Button>
      ) : null}
    </div>
  );
}
