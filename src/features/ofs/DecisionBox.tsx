// What OFS decided, for everyone who reads the item (Jesse, Oct 22): one solid box, green "OFS: Approved" or red "OFS: Not
// approved" (lib/status), his comment, who and when on the job's clock. Earlier decisions sit behind one link.
import type { OfsDecisionRow } from '../../data/ofs.types';
import { formatInZone } from '../../lib/dates';
import { BehindLink } from '../../ui/BehindLink';

const LABEL = { approved: 'OFS: Approved', not_approved: 'OFS: Not approved' } as const;

function byLine(d: OfsDecisionRow, zone: string): string {
  return [d.name, formatInZone(d.at, zone, 'MMM d, yyyy h:mm a')].filter((x) => x !== null).join(' · ');
}

interface DecisionBoxProps {
  decision: OfsDecisionRow;
  history: readonly OfsDecisionRow[];
  zone: string;
}

export function DecisionBox({ decision, history, zone }: DecisionBoxProps) {
  const k = decision.decision;
  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="ofs-decision"
        data-decision={k}
        className="rounded-lg border-2 px-4 py-3 shadow-control"
        style={{ background: `var(--status-${k}-solid)`, color: `var(--status-${k}-on-solid)`, borderColor: `var(--status-${k}-solid)` }}
      >
        <p className="text-[17px] font-semibold leading-6">{LABEL[k]}</p>
        {decision.comment ? (
          <p data-testid="ofs-decision-comment" className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
            {decision.comment}
          </p>
        ) : null}
        <p className="mt-1 text-xs opacity-90">{byLine(decision, zone)}</p>
      </div>
      {history.length > 0 ? (
        <BehindLink label="Earlier" testId="ofs-earlier">
          <ul className="flex flex-col gap-1 text-sm text-ink-2">
            {history.map((d) => (
              <li key={`${d.at}:${d.decision}`} className="break-words">
                <span className="font-medium" style={{ color: `var(--status-${d.decision}-fg)` }}>
                  {LABEL[d.decision]}
                </span>
                {d.comment ? ` · ${d.comment}` : ''} · {byLine(d, zone)}
              </li>
            ))}
          </ul>
        </BehindLink>
      ) : null}
    </div>
  );
}
