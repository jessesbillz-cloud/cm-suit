// The tiny form for a quick phrase (0117): one line on what it is, the text (a new one starts from what the note says
// now), its name on the chip (from the text's first words until typed), and Everywhere (off: it shows on this kind of
// note box only). Opened from a held chip it also moves the chip earlier or later and removes it, with Undo.
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { messageOf, refusalOf } from '../../data/errors';
import { useAddPhrase, useEditPhrase, useOrderPhrases, useRemovePhrase, useRestorePhrase } from '../../data/phrases';
import { PHRASE_LIMITS, type NotePlace, type QuickPhrase } from '../../data/phrases.types';
import { Button } from '../../ui/Button';
import { CheckField, FIELD_AREA, FIELD_CONTROL, FIELD_LABEL } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { nameFrom } from './phraseText';

interface PhraseFormProps {
  place: NotePlace;
  /** The phrase held to change it; null: a new one. */
  phrase: QuickPhrase | null;
  /** A new one starts from this (what the note says now). */
  seed: string;
  /** All my phrases in order (moving one moves it among them). */
  all: readonly QuickPhrase[];
  onDone: () => void;
}

/** My phrases' ids with this one moved one place (-1 earlier, 1 later). */
function moved(all: readonly QuickPhrase[], id: string, by: -1 | 1): string[] | null {
  const ids = all.map((p) => p.id);
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const a = ids[i];
  const b = ids[j];
  if (a === undefined || b === undefined) return null;
  ids[i] = b;
  ids[j] = a;
  return ids;
}

export function PhraseForm({ place, phrase, seed, all, onDone }: PhraseFormProps) {
  const add = useAddPhrase();
  const edit = useEditPhrase();
  const remove = useRemovePhrase();
  const restore = useRestorePhrase();
  const order = useOrderPhrases();
  const toast = useToast();
  const [key] = useState(() => crypto.randomUUID());
  const [body, setBody] = useState(phrase?.body ?? seed.trim().slice(0, PHRASE_LIMITS.body));
  const [label, setLabel] = useState(phrase?.label ?? nameFrom(seed));
  const [named, setNamed] = useState(phrase !== null);
  const [everywhere, setEverywhere] = useState(phrase?.context === 'any');
  const saving = add.isPending || edit.isPending;
  const failed = add.error ?? edit.error ?? order.error;

  function save() {
    const v = { label: label.trim(), body: body.trim(), context: everywhere ? ('any' as const) : place };
    if (phrase === null) add.mutate({ ...v, key }, { onSuccess: onDone });
    else edit.mutate({ ...v, phrase }, { onSuccess: onDone });
  }

  function drop(p: QuickPhrase) {
    remove.mutate(p, {
      onSuccess: () => {
        onDone();
        toast.show({
          message: `${p.label} removed`,
          action: {
            label: 'Undo',
            onClick: () => {
              restore.mutate(p.id, {
                onError: (e) => {
                  toast.show({ tone: 'error', message: messageOf(e) });
                },
              });
            },
          },
        });
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: messageOf(e) });
      },
    });
  }

  function move(p: QuickPhrase, by: -1 | 1) {
    const ids = moved(all, p.id, by);
    if (ids !== null) order.mutate(ids);
  }

  return (
    <form
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-page/50 p-3"
      data-testid="phrase-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-xs text-ink-2">Save a phrase you use a lot. Tap it to add it, hold it to change it.</p>
      <label className={FIELD_LABEL}>
        Text
        <textarea
          rows={2}
          maxLength={PHRASE_LIMITS.body}
          className={FIELD_AREA}
          value={body}
          autoFocus={seed.trim() === '' || phrase !== null}
          data-testid="phrase-text"
          onChange={(e) => {
            setBody(e.target.value);
            if (!named) setLabel(nameFrom(e.target.value));
          }}
        />
      </label>
      <label className={FIELD_LABEL}>
        Name
        <input
          className={FIELD_CONTROL}
          maxLength={PHRASE_LIMITS.label}
          value={label}
          data-testid="phrase-name"
          onChange={(e) => {
            setLabel(e.target.value);
            setNamed(true);
          }}
        />
      </label>
      <CheckField label="Everywhere" checked={everywhere} onChange={setEverywhere} testId="phrase-everywhere" />
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {refusalOf(failed)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {phrase !== null ? (
          <>
            <Button size="sm" variant="quiet" icon={ChevronLeft} aria-label="Earlier" disabled={order.isPending} onClick={() => { move(phrase, -1); }} />
            <Button size="sm" variant="quiet" icon={ChevronRight} aria-label="Later" disabled={order.isPending} onClick={() => { move(phrase, 1); }} />
            <Button size="sm" variant="quiet" icon={Trash2} loading={remove.isPending} data-testid="phrase-remove" onClick={() => { drop(phrase); }}>
              Remove
            </Button>
          </>
        ) : null}
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="quiet" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="primary" loading={saving} disabled={body.trim() === '' || label.trim() === ''} data-testid="phrase-save">
            Save
          </Button>
        </span>
      </div>
    </form>
  );
}
