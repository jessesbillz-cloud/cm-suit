// My quick phrases above a note box (0117; Jesse, Oct 23: "I want some quick buttons ... tap it and it says the same
// thing every time"): one chip per phrase for this kind of box (and the ones for every box), then Quick button, which
// opens the tiny form, starting from what the note says now. Mine only: nobody else sees them, and none ship.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useQuickPhrases } from '../../data/phrases';
import type { NotePlace } from '../../data/phrases.types';
import { Icon } from '../../ui/Icon';
import { CHIP, PhraseChip } from './PhraseChip';
import { PhraseForm } from './PhraseForm';
import { shownFor } from './phraseText';

interface QuickPhrasesProps {
  place: NotePlace;
  /** What the note says now (a new phrase starts from it). */
  current: string;
  onPick: (body: string) => void;
}

export function QuickPhrases({ place, current, onPick }: QuickPhrasesProps) {
  const phrases = useQuickPhrases();
  // 'new', or the id of the phrase held to change it.
  const [open, setOpen] = useState<string | null>(null);
  const all = phrases.data ?? [];
  const editing = open !== null && open !== 'new' ? (all.find((p) => p.id === open) ?? null) : null;
  const close = () => {
    setOpen(null);
  };

  return (
    <div className="flex flex-col gap-2" data-testid={`phrases-${place}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {phrases.isPending ? <span className="h-8 w-24 animate-pulse rounded-full bg-card-head" aria-label="Loading quick buttons" /> : null}
        {phrases.isError ? (
          <button type="button" className="text-left text-xs text-danger underline" onClick={() => void phrases.refetch()}>
            Quick buttons: {messageOf(phrases.error)} Retry
          </button>
        ) : null}
        {shownFor(all, place).map((p) => (
          <PhraseChip
            key={p.id}
            phrase={p}
            onTap={() => {
              onPick(p.body);
            }}
            onEdit={() => {
              setOpen(p.id);
            }}
          />
        ))}
        <button
          type="button"
          className={`${CHIP} text-ink-2`}
          aria-expanded={open === 'new'}
          data-testid="phrase-new"
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            setOpen(open === 'new' ? null : 'new');
          }}
        >
          <Icon icon={Plus} size={14} />
          Quick button
        </button>
      </div>
      {open === 'new' || editing !== null ? (
        <PhraseForm key={open} place={place} phrase={editing} seed={open === 'new' ? current : ''} all={all} onDone={close} />
      ) : null}
    </div>
  );
}
