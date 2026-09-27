// PUBLIC ENDPOINT (SPEC §6.4 #7): a person's calendar feed (iCalendar), GET /calendar-feed?t=<token>.
//
// Why public: calendar apps (phone, Google, Outlook) subscribe to a URL and refetch it on their own schedule, with no
// session and no headers of ours. The 32-byte random token is the secret; only its sha256 is stored
// (calendar_feed_tokens), and the person replaces it with "New link" in Settings, which stops the old one at once.
// The feed carries exactly what the person may see in the app at a one-step sign-in (calendar_feed_lines), read live
// on every fetch, so a revoked membership or a deleted line drops out on the next refresh.
//
// Service role: the caller has no session, so this function is the gate; calendar_feed_lines is service-only.
// A missing, malformed or unknown token is one bare 404, so the endpoint never says which part was wrong.
import { handlePublic, HttpError } from '../_shared/http.ts';
import { must, rpc, serviceClient } from '../_shared/db.ts';
import { z } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { BRAND_NAME } from '../_shared/env.ts';
import { buildIcs } from '../_shared/ics.ts';

const Query = z.object({ t: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

interface FeedRow {
  id: string;
  project_name: string;
  timezone: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: string | null;
  updated_at: string;
}

Deno.serve(handlePublic(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(400, 'Use GET');
  const service = serviceClient();
  // Generous per IP: calendar services fetch many people's feeds from shared addresses.
  await limit(service, `calendar-feed:ip:${clientIp(req) ?? 'unknown'}`, 120, 2);

  const query = Query.safeParse({ t: new URL(req.url).searchParams.get('t') ?? undefined });
  if (!query.success) throw new HttpError(404, 'Not found');
  const tokenHash = await sha256Hex(query.data.t);
  // Per token (keyed by its hash, never the raw token): apps refetch every few minutes at most.
  await limit(service, `calendar-feed:token:${tokenHash}`, 10, 10 / 300);

  const rows = await rpc<FeedRow[] | null>(service, 'calendar_feed_lines', { p_token_hash: tokenHash });
  // No rows: an unknown token (404) or a real one with nothing in the window (an empty calendar). Ask only then.
  if (!rows || rows.length === 0) {
    const known = must(
      await service.from('calendar_feed_tokens').select('user_id').eq('token_hash', tokenHash).maybeSingle(),
      'calendar_feed_tokens lookup',
    );
    if (!known) throw new HttpError(404, 'Not found');
  }

  const body = buildIcs(BRAND_NAME(), (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    location: r.location,
    jobName: r.project_name,
    timezone: r.timezone,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    status: r.status,
    updatedAt: r.updated_at,
  })));
  // The one 200 not built by http.ts: its body is text/calendar, not JSON. CORS headers are added by handlePublic.
  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="calendar.ics"',
      'cache-control': 'private, max-age=300',
    },
  });
}));
