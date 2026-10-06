// The RFI form as typed, and what a save sends. Only the title and the question are required; the rest sits below and
// never blocks sending. Pure, unit-tested.
import type { RfiFields, RfiRow } from '../../data/rfis.types';

export interface DraftForm {
  title: string;
  question: string;
  suggestion: string;
  refs: string;
  cost: boolean;
  time: boolean;
  /** Photos already on the RFI that stay. */
  kept: string[];
}

export function formOf(row: RfiRow | null): DraftForm {
  return {
    title: row?.title ?? '',
    question: row?.question ?? '',
    suggestion: row?.suggestion ?? '',
    refs: row?.refs ?? '',
    cost: row?.cost_impact === true,
    time: row?.time_impact === true,
    kept: row ? [...row.photo_ids] : [],
  };
}

/** What a save sends: trimmed text, the kept photos then the new ones, unchecked impact = not claimed (null). */
export function fieldsOf(form: DraftForm, uploaded: readonly string[]): RfiFields {
  return {
    title: form.title.trim(),
    question: form.question.trim(),
    photoIds: [...form.kept, ...uploaded.filter((id) => !form.kept.includes(id))],
    suggestion: form.suggestion.trim(),
    refs: form.refs.trim(),
    costImpact: form.cost ? true : null,
    timeImpact: form.time ? true : null,
  };
}

/** The database takes a draft only with a title and a question. */
export function missingText(f: Pick<RfiFields, 'title' | 'question'>): string | null {
  if (f.title === '' && f.question === '') return 'Add a title and a question.';
  if (f.title === '') return 'Add a title.';
  return f.question === '' ? 'Add the question.' : null;
}
