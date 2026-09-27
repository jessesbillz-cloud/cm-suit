// The only way to build a response (SPEC §6.3). Never 200 on a failure.
import { corsHeaders } from './cors.ts';

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

function json(status: number, body: Json, req: Request, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(req), ...extra },
  });
}

export const ok = (req: Request, body: Json) => json(200, body, req);
export const created = (req: Request, body: Json) => json(201, body, req);
export const noContent = (req: Request) => new Response(null, { status: 204, headers: corsHeaders(req) });
export const badRequest = (req: Request, message: string, details?: unknown) =>
  json(400, { error: 'bad_request', message, details: details ?? null }, req);
export const unauthorized = (req: Request, message = 'Sign in required') => json(401, { error: 'unauthorized', message }, req);
export const forbidden = (req: Request, message = 'Not allowed') => json(403, { error: 'forbidden', message }, req);
export const notFound = (req: Request, message = 'Not found') => json(404, { error: 'not_found', message }, req);
export const conflict = (req: Request, message: string) => json(409, { error: 'conflict', message }, req);
export const tooMany = (req: Request, retryAfterSec: number) =>
  json(429, { error: 'too_many_requests', retry_after: retryAfterSec }, req, { 'retry-after': String(retryAfterSec) });
/** A refusal the client acts on by its machine-readable `error` code (e.g. 403 reauth_required, 409 text_not_ready). */
export const refuse = (req: Request, status: 400 | 403 | 404 | 409, code: string, message: string) =>
  json(status, { error: code, message }, req);
export const serverError = (req: Request, errId: string) =>
  json(500, { error: 'server_error', message: `Something went wrong. Error ID ${errId}`, error_id: errId }, req);

/** Thrown by helpers to short-circuit a handler with a specific response. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
  }
}

export function errorId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Wraps a handler: OPTIONS preflight, HttpError → response, anything else → 500 with a logged error ID.
 */
export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) {
        switch (e.status) {
          case 400: return badRequest(req, e.message, e.details);
          case 401: return unauthorized(req, e.message);
          case 403: return forbidden(req, e.message);
          case 404: return notFound(req, e.message);
          case 409: return conflict(req, e.message);
          case 429: return tooMany(req, typeof e.details === 'number' ? e.details : 60);
          default: break;
        }
      }
      const id = errorId();
      console.error(`[${id}]`, e);
      return serverError(req, id);
    }
  };
}

/**
 * Public endpoints (SPEC §6.4) and webhooks: exactly handle(), but CORS allows any origin (SPEC §6.3).
 */
export function handlePublic(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  const inner = handle(fn);
  return async (req) => {
    const res = await inner(req);
    for (const [k, v] of Object.entries(corsHeaders(req, true))) res.headers.set(k, v);
    return res;
  };
}

/** 401 for the `share` endpoint: the recipient must sign in with an email code first (SPEC §6.4 #2). */
export const needsCode = (req: Request, emailMasked: string, reason: 'signed_out' | 'other_account') =>
  json(401, { error: 'unauthorized', message: 'Enter the code sent to your email', needs_code: true, email_masked: emailMasked, reason }, req);
