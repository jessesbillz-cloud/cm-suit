// Subs from the directory for the picked packages (SPEC §11.3: by package): each one with an email is one tap to add
// to the invite list as "Company <email>". The server links it back to the directory sub by name.
import { Plus } from 'lucide-react';
import { useSubs } from '../../data/subs.queries';
import type { SubRow } from '../../data/subs.types';
import { Button } from '../../ui/Button';

interface DirectoryPicksProps {
  orgId: string | undefined;
  /** The picked packages' codes. */
  codes: readonly string[];
  /** The emails already on the list (lowercase). */
  listed: ReadonlySet<string>;
  onAdd: (line: string) => void;
}

function emailOf(s: SubRow): string | null {
  return s.contacts.find((c) => c.email.trim() !== '')?.email.trim() ?? null;
}

export function DirectoryPicks({ orgId, codes, listed, onAdd }: DirectoryPicksProps) {
  const subs = useSubs(orgId);
  if (codes.length === 0 || !subs.data) return null;
  const rows = subs.data
    .filter((s) => s.trades.some((t) => codes.includes(t)))
    .flatMap((s) => {
      const email = emailOf(s);
      return email !== null && !listed.has(email.toLowerCase()) ? [{ s, email }] : [];
    });
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" data-testid="invite-directory">
      {rows.map(({ s, email }) => (
        <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block break-words text-ink">{s.company}</span>
            <span className="block break-all text-xs text-ink-2">{email}</span>
          </span>
          <Button
            size="sm"
            variant="quiet"
            icon={Plus}
            aria-label={`Add ${s.company}`}
            onClick={() => {
              onAdd(`${s.company} <${email}>`);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
