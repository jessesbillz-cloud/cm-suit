// The one note box with quick phrases (0117, rule 11): its label, my phrase chips for this kind of note, and the box. A
// tapped phrase goes in at the cursor when the box has it, else on a new line at the end (on the same line in a one-line
// box), never past the box's limit. A box that saves when it loses focus is told (onPhrase), so a tap is saved too.
import { useId, useRef } from 'react';
import type { NotePlace } from '../../data/phrases.types';
import { FIELD_AREA, FIELD_CONTROL, FIELD_LABEL } from '../../ui/Fields';
import { insertPhrase } from './phraseText';
import { QuickPhrases } from './QuickPhrases';

interface NoteBoxProps {
  label: string;
  place: NotePlace;
  value: string;
  onChange: (value: string) => void;
  /** A phrase was tapped in: the note as it is now. */
  onPhrase?: ((value: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  rows?: number | undefined;
  /** A one-line box. */
  single?: boolean | undefined;
  maxLength?: number | undefined;
  autoFocus?: boolean | undefined;
  placeholder?: string | undefined;
  testId?: string | undefined;
  /** The box's own classes (e.g. ringed red while it is missing). */
  controlClass?: string | undefined;
  className?: string | undefined;
}

export function NoteBox(props: NoteBoxProps) {
  const { label, place, value, onChange, onPhrase, onBlur, rows = 3, single = false, maxLength = 4000, autoFocus, placeholder, testId, controlClass, className = '' } = props;
  const id = useId();
  const box = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  function pick(body: string) {
    const el = box.current;
    const focused = el !== null && document.activeElement === el;
    const at = focused && el.selectionStart !== null && el.selectionEnd !== null ? { start: el.selectionStart, end: el.selectionEnd } : null;
    const next = insertPhrase(value, body, at, !single, maxLength);
    onChange(next.text);
    onPhrase?.(next.text);
    if (focused) {
      window.requestAnimationFrame(() => {
        box.current?.setSelectionRange(next.caret, next.caret);
      });
    }
  }

  const common = {
    id,
    value,
    maxLength,
    autoFocus,
    placeholder,
    'data-testid': testId,
    onBlur,
  };
  return (
    <div className={`${FIELD_LABEL} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <QuickPhrases place={place} current={value} onPick={pick} />
      {single ? (
        <input
          {...common}
          ref={(el) => {
            box.current = el;
          }}
          type="text"
          autoComplete="off"
          className={controlClass ?? FIELD_CONTROL}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      ) : (
        <textarea
          {...common}
          ref={(el) => {
            box.current = el;
          }}
          rows={rows}
          className={controlClass ?? FIELD_AREA}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
