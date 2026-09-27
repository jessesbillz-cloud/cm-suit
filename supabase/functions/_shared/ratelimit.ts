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

/** The caller's IP as seen by the Supabase edge (first x-forwarded-for hop), or null. */
export function clientIp(req: Request): string | null {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return first || null;
}
