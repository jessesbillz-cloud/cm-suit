// An item's history (behind the one History link): who, what, note, photos, when. Oldest first.
import type { CorrectionHistoryRow } from '../../data/corrections.types';
import { formatInZone } from '../../lib/dates';
import { HISTORY_LABELS } from './model';
import { PhotoStrip } from './PhotoStrip';

interface CorrectionHistoryProps {
  projectId: string;
  history: readonly CorrectionHistoryRow[];
  nameOf: (userId: string | null) => string;
  timeZone: string;
}

function what(h: CorrectionHistoryRow, all: readonly CorrectionHistoryRow[]): string {
  if (h.action !== 'undone') return HISTORY_LABELS[h.action];
  const undone = all.find((x) => x.id === h.undoes);
  return undone ? `Undid: ${HISTORY_LABELS[undone.action]}` : HISTORY_LABELS.undone;
}

export function CorrectionHistory({ projectId, history, nameOf, timeZone }: CorrectionHistoryProps) {
  return (
    <ol className="mt-2 flex flex-col gap-3 border-t border-line pt-4" data-testid="cn-history">
      {history.map((h) => (
        <li key={h.id} className="flex flex-col gap-1">
          <p className="text-sm text-ink">
            <span className="font-medium">{what(h, history)}</span>
            <span className="text-ink-2">
              {' '}
              &middot; {nameOf(h.actor_user_id)} &middot; {formatInZone(h.created_at, timeZone, 'MMM d, yyyy h:mm a')}
            </span>
          </p>
          {h.note !== '' ? <p className="whitespace-pre-wrap break-words text-sm text-ink-2">{h.note}</p> : null}
          <PhotoStrip projectId={projectId} ids={h.photo_ids} timeZone={timeZone} />
        </li>
      ))}
    </ol>
  );
}
