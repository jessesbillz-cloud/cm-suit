// `deno test supabase/functions/_shared/ratelimit_test.ts` — which address the per-IP limits key on.
import { clientIp } from './ratelimit.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const req = (headers: Record<string, string>) => new Request('https://edge.example.test/functions/v1/request-link', { headers });

Deno.test('client IP: the address Cloudflare saw, never what the visitor typed', () => {
  check(clientIp(req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4, 203.0.113.7' })) === '203.0.113.7',
    'CF-Connecting-IP first');
  check(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' })) === '203.0.113.7',
    'a forged first hop is ignored: the last hop is the one the edge appended');
  check(clientIp(req({ 'x-forwarded-for': '203.0.113.7' })) === '203.0.113.7', 'one hop');
  check(clientIp(req({ 'x-forwarded-for': ' , ' })) === null, 'nothing usable');
  check(clientIp(req({})) === null, 'no header');
});
