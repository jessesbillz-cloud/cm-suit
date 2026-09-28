// The only place edge functions are called. Non-2xx answers become a thrown FunctionError.
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { z } from 'zod';
import { SUPABASE_URL, supabase } from './client';

type FunctionName =
  | 'access'
  | 'share'
  | 'download'
  | 'invite-member'
  | 'revoke-member'
  | 'send-transmittal'
  | 'invite-bidders'
  | 'issue-addendum'
  | 'extract-bid'
  | 'import-subs'
  | 'calendar-feed';

export class FunctionError extends Error {
  override readonly name = 'FunctionError';
  constructor(
    /** HTTP status; 0 when the server could not be reached. */
    readonly status: number,
    /** Machine code from the body, e.g. 'forbidden', 'not_found', 'unauthorized'. */
    readonly error: string,
    message: string,
    /** Short error ID from a 500, shown to people so support can find it in Sentry. */
    readonly errorId: string | null,
    /** The whole parsed body, for callers that need extra fields (e.g. share's needs_code). */
    readonly body: Record<string, unknown> | null,
  ) {
    super(message);
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if (text === '') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { message: text };
  } catch (e) {
    // Not JSON (e.g. a gateway page). Keep the text as the message; log the parse failure.
    console.warn('edge function returned non-JSON', e);
    return { message: text.slice(0, 300) };
  }
}

async function toFunctionError(err: unknown): Promise<FunctionError> {
  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response;
    const body = await readBody(res);
    return new FunctionError(
      res.status,
      str(body?.['error']) ?? 'error',
      str(body?.['message']) ?? `Request failed (${String(res.status)})`,
      str(body?.['error_id']),
      body,
    );
  }
  return new FunctionError(0, 'network', 'Could not reach the server. Check your connection and try again.', null, null);
}

/**
 * POSTs JSON (or a multipart form, for file uploads like import-subs) to an edge function with the current session's
 * bearer token (supabase-js adds it) and validates the answer with `schema`, so a changed contract fails loudly here
 * instead of deep in a screen.
 */
export async function callFunction<T>(
  name: FunctionName,
  body: object | FormData,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  // Request shapes are plain JSON objects; supabase-js types the body as a string-keyed record. A FormData goes as
  // multipart (supabase-js leaves its content type to the browser).
  const payload = body instanceof FormData ? body : (body as Record<string, unknown>);
  const res = await supabase.functions.invoke<unknown>(name, { body: payload, method: 'POST' });
  const err: unknown = res.error;
  if (err) throw await toFunctionError(err);
  return schema.parse(res.data);
}

/** An edge function's public URL: the same base supabase-js invokes (`<project>/functions/v1/<name>`). */
export function functionUrl(name: FunctionName): string {
  return `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/${name}`;
}
