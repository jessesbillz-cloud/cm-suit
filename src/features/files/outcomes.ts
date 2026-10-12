// The words of a batch of file writes (Delete, Move, their Undo): "Plan.pdf" for one, "3 files" for more, and one line
// for the ones the database refused, in its own words (the first one's reason).
import { refusalOf } from '../../data/errors';
import type { Outcome } from '../../data/files';

export function howMany(names: readonly string[]): string {
  const [only] = names;
  return names.length === 1 && only !== undefined ? only : `${String(names.length)} files`;
}

/** The writes that went through, each with what it answered. */
export function done<T, R>(results: readonly Outcome<T, R>[]): { item: T; value: R }[] {
  return results.flatMap((r) => (r.ok ? [{ item: r.item, value: r.value }] : []));
}

/** "2 files not moved: Only the app adds to that folder.", or null when every write went through. */
export function refusedLine<T, R>(results: readonly Outcome<T, R>[], nameOf: (item: T) => string, verb: string): string | null {
  const failed = results.flatMap((r) => (r.ok ? [] : [{ item: r.item, error: r.error }]));
  const [first] = failed;
  if (!first) return null;
  return `${howMany(failed.map((r) => nameOf(r.item)))} not ${verb}: ${refusalOf(first.error)}`;
}
