// Quick phrases on a note (0117), the pure parts: which phrases a note box shows, the name a new one gets from its
// text, and where a tapped phrase goes in the note (at the cursor when the box has it, else on a new line at the end).
import { PHRASE_LIMITS, type NotePlace, type QuickPhrase } from '../../data/phrases.types';

/** The phrases for this kind of note box: its own and the ones for every box, in my order. */
export function shownFor(phrases: readonly QuickPhrase[], place: NotePlace): QuickPhrase[] {
  return phrases.filter((p) => p.context === 'any' || p.context === place);
}

/** A name for a new phrase from its text: its first words, up to four, within the name's limit. */
export function nameFrom(text: string): string {
  const words = text.trim().split(/\s+/).filter((w) => w !== '');
  let name = '';
  for (const w of words.slice(0, 4)) {
    const next = name === '' ? w : `${name} ${w}`;
    if (next.length > PHRASE_LIMITS.label) break;
    name = next;
  }
  return name === '' ? text.trim().slice(0, PHRASE_LIMITS.label) : name;
}

interface Caret {
  start: number;
  end: number;
}

/** The note with the phrase in it, and where the cursor goes after it. `at` null: the box doesn't have the cursor. */
export function insertPhrase(value: string, phrase: string, at: Caret | null, multiline: boolean, max: number): { text: string; caret: number } {
  let text: string;
  let caret: number;
  if (at === null) {
    const head = value.replace(/\s+$/, '');
    text = head === '' ? phrase : `${head}${multiline ? '\n' : ' '}${phrase}`;
    caret = text.length;
  } else {
    const before = value.slice(0, at.start);
    const after = value.slice(at.end);
    const lead = before === '' || /\s$/.test(before) ? '' : ' ';
    const trail = /^\w/.test(after) ? ' ' : '';
    caret = before.length + lead.length + phrase.length;
    text = `${before}${lead}${phrase}${trail}${after}`;
  }
  return { text: text.slice(0, max), caret: Math.min(caret, max) };
}
