// Errors are loud (CLAUDE.md rule 6): every Supabase { error } becomes a thrown DataError. Never swallowed.

interface PgLikeError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export class DataError extends Error {
  override readonly name = 'DataError';
  constructor(
    message: string,
    /** Postgres / PostgREST code, e.g. 42501, 40001, PGRST116. */
    readonly code: string | null,
    /** The server's own message, for logs and Sentry; not shown to people. */
    readonly serverMessage: string | null,
  ) {
    super(message);
  }
}

const SHORT_MESSAGES: Record<string, string> = {
  '42501': "You don't have access to that.",
  '40001': 'Someone else changed this first. Reload and try again.',
  P0002: 'That item no longer exists.',
  PGRST116: 'That item no longer exists.',
  '23505': 'That already exists.',
  '23514': 'That value is not allowed.',
  '23503': 'That refers to something that no longer exists.',
};

export function toDataError(e: PgLikeError): DataError {
  const code = e.code ?? null;
  const short = code !== null ? SHORT_MESSAGES[code] : undefined;
  return new DataError(short ?? e.message, code, e.message);
}

/** Returns data or throws. For queries that must return a row or a list. */
export function throwIfError<T>(res: { data: T | null; error: PgLikeError | null }): T {
  if (res.error) throw toDataError(res.error);
  if (res.data === null) throw new DataError('That item no longer exists.', 'PGRST116', null);
  return res.data;
}

/** Returns data (possibly null, e.g. maybeSingle) or throws. */
export function throwIfErrorMaybe<T>(res: { data: T | null; error: PgLikeError | null }): T | null {
  if (res.error) throw toDataError(res.error);
  return res.data;
}

/** An optimistic-concurrency miss: the row changed (or vanished) since it was read. */
export function conflictError(): DataError {
  return new DataError(SHORT_MESSAGES['40001'] ?? 'Conflict', '40001', 'version check matched 0 rows');
}

/** One sentence for a toast or an error state, whatever was thrown. */
export function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
