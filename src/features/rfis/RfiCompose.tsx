// Writing an RFI: a new one, or my draft (also one sent back to me). The fields autosave as a draft; "Sign & send"
// saves what is typed, asks for a fresh sign-in when needed (SignButton) and sends it into the job's route. The
// sticky footer keeps Sign & send in reach however long the form gets.
import { useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSignSend, useVoidRfi } from '../../data/rfis.mutations';
import type { RfiEvent, RfiFileRef, RfiRow } from '../../data/rfis.types';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { SaveState } from '../../ui/SaveState';
import { useToast } from '../../ui/Toast';
import { SignButton } from '../auth/SignButton';
import { RfiEditor } from './RfiEditor';
import { useRfiDraft } from './useRfiDraft';

interface ReturnedProps {
  event: RfiEvent;
  timeZone: string;
}

/** Why it came back to me: who sent it back, when, and their note. */
function Returned({ event, timeZone }: ReturnedProps) {
  return (
    <div className="rounded-lg border border-accent/25 bg-accent-soft px-3.5 py-3 text-sm" data-testid="rfi-returned">
      <p className="text-ink-2">
        <span className="font-medium text-ink">Sent back</span> · {event.actor_name ?? 'Someone'} · {formatInZone(event.at, timeZone, 'MMM d, h:mm a')}
      </p>
      {event.note ? <p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.note}</p> : null}
    </div>
  );
}

interface DiscardProps {
  row: RfiRow;
  onDone: () => void;
}

/** A draft can go: asked once, inline (voiding is permanent). */
function Discard({ row, onDone }: DiscardProps) {
  const discard = useVoidRfi();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="quiet" icon={Trash2} data-testid="rfi-discard" onClick={() => { setAsking(true); }}>
        Discard
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm text-ink">
      Discard draft?
      <Button
        size="sm"
        variant="danger"
        loading={discard.isPending}
        data-testid="rfi-discard-confirm"
        onClick={() => {
          discard.mutate({ ref: row, note: 'Draft discarded' }, { onSuccess: onDone });
        }}
      >
        Discard
      </Button>
      <Button size="sm" variant="quiet" onClick={() => { setAsking(false); }}>
        Keep
      </Button>
      {discard.isError ? <span className="text-danger">{messageOf(discard.error)}</span> : null}
    </span>
  );
}

interface RfiComposeProps {
  projectId: string;
  /** My draft, or null for a new RFI. */
  row: RfiRow | null;
  photos: readonly RfiFileRef[];
  /** The latest "sent back", when it came back to me. */
  returned: RfiEvent | null;
  timeZone: string;
  isPhone: boolean;
  onSent: (id: string) => void;
  onDiscarded: () => void;
}

export function RfiCompose({ projectId, row, photos, returned, timeZone, isPhone, onSent, onDiscarded }: RfiComposeProps) {
  const draft = useRfiDraft(projectId, row);
  const send = useSignSend();
  const toast = useToast();
  const sent = useRef<RfiRow | null>(null);

  async function sign() {
    const { row: saved, problem } = await draft.flush();
    if (problem !== null) throw new Error(problem);
    if (saved === null) throw new Error('Add a title and a question.');
    sent.current = await send.mutateAsync({ ref: saved });
  }

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="rfi-compose"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <header className="flex items-baseline justify-between gap-3">
          <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">{row === null ? 'New RFI' : 'Draft'}</h1>
          <SaveState pending={draft.saving} saved={draft.justSaved} problem={null} />
        </header>
        {returned ? <Returned event={returned} timeZone={timeZone} /> : null}
        <RfiEditor draft={draft} photos={photos} isPhone={isPhone} autoFocus={!isPhone && row === null} />
        {draft.problem !== null ? (
          <p role="alert" className="text-sm text-danger">
            {draft.problem}
          </p>
        ) : null}
      </div>
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-card px-5 py-3">
        {row !== null ? (
          <span className="mr-auto">
            <Discard row={row} onDone={onDiscarded} />
          </span>
        ) : null}
        <SignButton
          label="Sign & send"
          testId="rfi-send"
          icon={Send}
          pending={send.isPending}
          disabled={draft.photos.busy || draft.photos.failed}
          sign={sign}
          onSigned={() => {
            const done = sent.current;
            if (done === null) return;
            toast.show({ message: 'Signed and sent' });
            onSent(done.id);
          }}
        />
      </footer>
    </form>
  );
}
