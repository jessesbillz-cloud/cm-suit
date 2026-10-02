// Token-bucket rate limits backed by public.consume_rate_limit (service role only). Used by every public endpoint.
import { HttpError } from './http.ts';
import { type Db, rpc } from './db.ts';

/**
 * Consumes one token from bucket `service:key`-style `key`. Throws 429 (with Retry-After) when empty.
 * `service` must be a service-role client: the RPC is not granted to users.
 */
export async function limit(service: Db, key: string, capacity: number, refillPerSec: number): Promise<void> {
  const allowed = await rpc<boolean>(service, 'consume_rate_limit', {
    p_key: key,
    p_capacity: capacity,
    p_refill_per_sec: refillPerSec,
    p_cost: 1,
  });
  if (allowed !== true) throw new HttpError(429, 'Too many requests', Math.max(1, Math.ceil(1 / refillPerSec)));
}

/**
 * The caller's IP for per-IP limits and audit lines, or null. A visitor can send any X-Forwarded-For they like, and
 * Supabase's edge appends the address it saw rather than replacing the header, so the first hop is the visitor's own
 * text. Trusted, in order: CF-Connecting-IP (set by Cloudflare in front of Supabase, which overwrites whatever the
 * client sent), then the LAST X-Forwarded-For hop (the one the edge appended). Request-link also limits per token.
 */
export function clientIp(req: Request): string | null {
  const cf = (req.headers.get('cf-connecting-ip') ?? '').trim();
  if (cf) return cf;
  const hops = (req.headers.get('x-forwarded-for') ?? '').split(',').map((h) => h.trim()).filter((h) => h !== '');
  return hops[hops.length - 1] ?? null;
}
