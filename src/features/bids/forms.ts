// Bid forms screen helpers (pure, unit-tested): the two groups in order, what counts as missing, the row chip.
import type { BidFormItem, FormStatus, FormTiming } from '../../data/bidForms';
import type { Chip } from './model';

/** The right-column item that holds the "Add form" form (never a row id: rows are uuids). */
export const NEW_FORM_ITEM = 'new-form';

export const TIMING_LABELS: Record<FormTiming, string> = { with_bid: 'With the bid', after_award: 'After award' };

export const STATUS_LABELS: Record<FormStatus, string> = { to_do: 'To do', done: 'Done', n_a: 'N/A' };

const TIMING_ORDER: readonly FormTiming[] = ['with_bid', 'after_award'];

/** Once a job is won, the after-award forms are due too. */
const WON_STAGES: readonly string[] = ['awarded', 'construction', 'closeout'];

type FormLike = Pick<BidFormItem, 'timing' | 'status' | 'required' | 'sort' | 'due_on'>;

interface FormGroup<T extends FormLike> {
  timing: FormTiming;
  label: string;
  items: T[];
}

/** "With the bid" then "After award", each in its template order; a group with nothing in it is left out. */
export function groupForms<T extends FormLike>(items: readonly T[]): FormGroup<T>[] {
  return TIMING_ORDER.map((timing) => ({
    timing,
    label: TIMING_LABELS[timing],
    items: items.filter((i) => i.timing === timing).sort((a, b) => a.sort - b.sort),
  })).filter((g) => g.items.length > 0);
}

/** Is this form due now: the bid's always, the award's once the job is won. */
function isDueNow(item: FormLike, stage: string): boolean {
  return item.timing === 'with_bid' || WON_STAGES.includes(stage);
}

/** Required forms still to do that are due now. The Forms tab shows this number. */
export function missingCount(items: readonly FormLike[], stage: string): number {
  return items.filter((i) => i.required && i.status === 'to_do' && isDueNow(i, stage)).length;
}

/** Done and N/A both settle a form: "8 of 13 done" and its bar. */
export function settledCount(items: readonly FormLike[]): number {
  return items.filter((i) => i.status !== 'to_do').length;
}

/**
 * The row's chip (lib/status keys only). A missing form is yellow; past its due day, red. An award form before the
 * award and an optional one are gray, so the yellow chips are exactly the tab's count.
 */
export function formChip(item: FormLike, stage: string, today: string): Chip {
  if (item.status === 'done') return { status: 'confirmed', label: STATUS_LABELS.done };
  if (item.status === 'n_a') return { status: 'cancelled', label: STATUS_LABELS.n_a };
  if (!item.required) return { status: 'cancelled', label: 'Optional' };
  if (!isDueNow(item, stage)) return { status: 'cancelled', label: 'Later' };
  if (item.due_on !== null && item.due_on < today) return { status: 'blocked', label: 'Overdue' };
  return { status: 'pending', label: STATUS_LABELS.to_do };
}
