// The fire marshal's one tap (Jesse, Oct 22: "he just needs a simple approve or disapprove on it"): an optional comment,
// then two big boxes, Approve and Not approved. The tap records it (who and when, on the server). A record, so no Undo:
// a later tap decides again and the earlier decision stays in the history. Each tap carries its own key, so a retry of
// the same tap is the same decision. The comment takes his quick phrases (NoteBox, 0117).
import { useState } from 'react';
import { Check, X, type LucideIcon } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useOfsDecide } from '../../data/ofs';
import type { OfsDecision, OfsItem } from '../../data/ofs.types';
import { FOCUS_RING } from '../../ui/box';
import { Icon } from '../../ui/Icon';
import { NoteBox } from '../phrases/NoteBox';

// The boldest things on the screen (Jesse, Oct 23): tall solid boxes with a black edge, the words in the display face.
const BOX = `heading flex min-h-20 flex-1 items-center justify-center gap-3 rounded-card border-2 border-ink px-5 py-4 text-[24px] font-semibold tracking-[0.06em] shadow-tile transition-[box-shadow,transform,filter] duration-150 hover:-translate-y-px hover:shadow-tile-hover hover:brightness-110 active:translate-y-0 active:shadow-press disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70 ${FOCUS_RING}`;

interface DecideBoxesProps {
  projectId: string;
  item: OfsItem & { id: string };
}

export function DecideBoxes({ projectId, item }: DecideBoxesProps) {
  const decide = useOfsDecide();
  const [comment, setComment] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [problem, setProblem] = useState<string | null>(null);

  function record(decision: OfsDecision) {
    setProblem(null);
    decide.mutate(
      { projectId, itemId: item.id, version: item.version, decision, comment, key },
      {
        onSuccess: () => {
          setComment('');
          setKey(crypto.randomUUID());
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  const box = (decision: OfsDecision, label: string, icon: LucideIcon, testId: string) => (
    <button
      type="button"
      data-testid={testId}
      disabled={decide.isPending}
      className={BOX}
      style={{
        background: `var(--status-${decision}-solid)`,
        color: `var(--status-${decision}-on-solid)`,
      }}
      onClick={() => {
        record(decision);
      }}
    >
      <Icon icon={icon} size={28} />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="ofs-decide">
      <NoteBox label="Comment" place="ofs_decision" rows={2} maxLength={2000} value={comment} onChange={setComment} testId="ofs-comment" />
      <div className="flex flex-col gap-3 sm:flex-row">
        {box('approved', 'Approve', Check, 'ofs-approve')}
        {box('not_approved', 'Not approved', X, 'ofs-not-approve')}
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
