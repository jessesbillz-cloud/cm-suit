// Who has acknowledged an issued addendum and who hasn't (SPEC §11.5), so the estimator can chase each one. Names come
// from people_display only; the bidders are the job's invited bidders.
import { Check } from 'lucide-react';
import type { AckRow, InviteRow } from '../../data/bids.types';
import type { Person } from '../../data/types';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { PaneSection } from '../../ui/ReadingPane';
import { bidderName } from './model';

interface AckListProps {
  addendumId: string;
  acks: readonly AckRow[];
  invites: readonly InviteRow[];
  people: readonly Person[];
  tz: string;
}

export function AckList({ addendumId, acks, invites, people, tz }: AckListProps) {
  const members = [...new Set(invites.map((i) => i.member_id))];
  const ackOf = (m: string) => acks.find((a) => a.addendum_id === addendumId && a.member_id === m);
  const rows = members
    .map((m) => ({ m, name: bidderName(people.find((p) => p.member_id === m)), ack: ackOf(m) }))
    .sort((a, b) => Number(a.ack !== undefined) - Number(b.ack !== undefined) || a.name.localeCompare(b.name));
  const done = rows.filter((r) => r.ack !== undefined).length;
  return (
    <PaneSection title={`Acknowledged ${String(done)} of ${String(rows.length)}`} testId="addendum-acks">
      {rows.length === 0 ? <p className="text-ink-2">No bidders invited.</p> : null}
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.m} className="flex items-center gap-2 py-1.5" data-testid={r.ack ? 'ack-done' : 'ack-missing'}>
            <span className="min-w-0 flex-1 break-words">{r.name}</span>
            {r.ack ? (
              <span className="flex items-center gap-1 text-xs tabular-nums text-ink-2">
                <Icon icon={Check} size={14} />
                {formatInZone(r.ack.acked_at, tz, 'MMM d')}
              </span>
            ) : (
              <span className="text-xs text-danger">Not yet</span>
            )}
          </li>
        ))}
      </ul>
    </PaneSection>
  );
}
