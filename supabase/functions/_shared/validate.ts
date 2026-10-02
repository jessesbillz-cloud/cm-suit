// Request body validation. Every function parses its body through here (zod, 400 with details on failure).
import { z } from 'npm:zod@3.24.1';
import { HttpError } from './http.ts';

export { z };

export const uuid = z.string().uuid();
/** Emails are compared and stored lowercase everywhere (project_members.invite_email, share_links.recipient_email). */
export const email = z.string().trim().toLowerCase().email().max(320);

/**
 * Reads a POST body as text once, with a size cap. Webhooks call this directly so the exact bytes can be
 * signature-checked (requireWebhook) before parseText; everyone else uses parseJson.
 */
export async function readBody(req: Request, maxBytes = 256 * 1024): Promise<string> {
  if (req.method !== 'POST') throw new HttpError(400, 'Use POST');
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(400, 'Request body too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(400, 'Request body too large');
  return text;
}

/** Parses JSON text and validates it (400 with details on failure). */
export function parseText<S extends z.ZodTypeAny>(text: string, schema: S): z.output<S> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new HttpError(400, 'Body is not valid JSON', e instanceof Error ? e.message : String(e));
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Invalid request', parsed.error.flatten());
  return parsed.data;
}

async function readCapped(body: ReadableStream<Uint8Array>, max: number, tooLarge: string): Promise<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(400, tooLarge);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Is this POST a multipart form (file uploads), rather than JSON? */
export function isMultipart(req: Request): boolean {
  return /^multipart\/form-data;/i.test(req.headers.get('content-type') ?? '');
}

/** Reads a POST multipart form with a hard size cap (a missing or false content-length does not get past it). */
export async function readForm(req: Request, maxBytes: number, tooLarge = 'Request body too large'): Promise<FormData> {
  if (req.method !== 'POST') throw new HttpError(400, 'Use POST');
  const type = req.headers.get('content-type') ?? '';
  if (!isMultipart(req)) throw new HttpError(400, 'Send the form as multipart/form-data');
  if (Number(req.headers.get('content-length') ?? '0') > maxBytes) throw new HttpError(400, tooLarge);
  if (!req.body) throw new HttpError(400, 'Empty request');
  const bytes = await readCapped(req.body, maxBytes, tooLarge);
  try {
    return await new Response(bytes, { headers: { 'content-type': type } }).formData();
  } catch (e) {
    throw new HttpError(400, 'Could not read the form', e instanceof Error ? e.message : String(e));
  }
}

/** Reads a POST JSON body, enforces a size cap, validates it. */
export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = 256 * 1024): Promise<z.output<S>> {
  return parseText(await readBody(req, maxBytes), schema);
}
