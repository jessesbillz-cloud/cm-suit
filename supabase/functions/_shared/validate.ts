// Request body validation. Every function parses its body through here (zod, 400 with details on failure).
import { z } from 'npm:zod@3.24.1';
import { HttpError } from './http.ts';

export { z };

export const uuid = z.string().uuid();
/** Emails are compared and stored lowercase everywhere (project_members.invite_email, share_links.recipient_email). */
export const email = z.string().trim().toLowerCase().email().max(320);

/** Reads a POST JSON body, enforces a size cap, validates it. */
export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = 256 * 1024): Promise<z.output<S>> {
  if (req.method !== 'POST') throw new HttpError(400, 'Use POST');
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(400, 'Request body too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(400, 'Request body too large');
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
