// Each person's quick phrases (migration 0117): the shape the app reads, the places a note box can be, and the
// database's limits, in one place (the server checks them again). No zod here, so pure helpers can take the limits.

/** Where a phrase shows: one kind of note box, or every one ('any'). */
export const PHRASE_PLACES = ['any', 'ir_result', 'ofs_decision', 'gc_return', 'correction'] as const;
type PhrasePlace = (typeof PHRASE_PLACES)[number];
export type NotePlace = Exclude<PhrasePlace, 'any'>;

/** quick_phrases' checks: 50 live a person, a name of 40 and a text of 500 characters. */
export const PHRASE_LIMITS = { count: 50, label: 40, body: 500 } as const;

export interface QuickPhrase {
  id: string;
  version: number;
  context: PhrasePlace;
  label: string;
  body: string;
  sort: number;
  deleted_at: string | null;
}

export interface PhraseInput {
  label: string;
  body: string;
  context: PhrasePlace;
}
