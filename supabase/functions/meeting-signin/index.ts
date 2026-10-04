// PUBLIC ENDPOINT (SPEC §6.4 #8): the meeting sign-in page (/m/<meeting>?t=<token>), the target of the QR code on a
// tailgate safety meeting's or a job meeting's screen (migration 0060).
//
// Why public: the crew signs in with their phone camera and no account (Jesse, Oct 3: "The only no-login page is for
// signing in to tailgate safety meetings or regular meetings: a public page they reach with the QR code, sign your name,
// and that's it; then they go away"). The token is the secret: 32 random bytes, only its SHA-256 stored
// (safety_meetings.token_hash), made when the leader starts the meeting, replaced by "New QR" (the old one stops at once)
// and dropped when the meeting closes; signing also ends 18 hours after the start.
//
// One function, one rate-limit family, one set of probe entries, one contract (_shared/meetingSignin.ts):
//   open  the job's name, the meeting's number, kind, title and day, and whether it still takes signatures;
//   sign  a name, a company, an optional trade and the signature's strokes (checked here and by the database). The same
//         name twice in one meeting is one line. The answer is { status: 'signed' } and nothing else: never anyone's
//         name, never an id.
// This endpoint grants nothing else: no session, no membership, no files. The SQL (link_meeting_*, service role only)
// answers null alike for a wrong token, a closed meeting and a meeting that does not exist, and the answers pass through
// the projections in _shared/meetingSignin.ts as well; a database error reaches the visitor only as our own plain
// refusal, never Postgres' text (publicRpc). Rate limits per IP (the address the edge saw, clientIp) on every call, per
// meeting (one QR, a whole crew) and, tighter, per IP on sign.
import { created, handlePublic, HttpError, ok } from '../_shared/http.ts';
import { publicRpc, serviceClient } from '../_shared/db.ts';
import { parseText, readBody } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { MeetingSigninBody, openAnswer, signAnswer, SIGNIN_MAX_BYTES } from '../_shared/meetingSignin.ts';

const ENDED = 'This sign-in has ended. Ask the person running the meeting.';

Deno.serve(handlePublic(async (req) => {
  const service = serviceClient();
  const ip = clientIp(req) ?? 'unknown';
  // Spent before the body is read.
  await limit(service, `meeting-signin:ip:${ip}`, 60, 1);
  const body = parseText(await readBody(req, SIGNIN_MAX_BYTES), MeetingSigninBody);
  // One QR sheet, a crew of fifty signing within a few minutes.
  await limit(service, `meeting-signin:meeting:${body.meeting_id}`, 300, 2);
  const link = { p_meeting_id: body.meeting_id, p_token_hash: await sha256Hex(body.token) };

  if (body.action === 'open') {
    const raw = await publicRpc<unknown>(service, 'link_meeting_open', link);
    if (raw === null) throw new HttpError(404, ENDED);
    return ok(req, openAnswer(raw));
  }

  // Phones on one cell network can share an address (and a foreman may pass his phone around): generous, but a flood
  // stops.
  await limit(service, `meeting-signin:sign-ip:${ip}`, 40, 40 / 600);
  const raw = await publicRpc<unknown>(service, 'link_meeting_sign', {
    ...link,
    p_name: body.name,
    p_company: body.company,
    p_trade: body.trade,
    p_signature: body.signature,
  });
  if (raw === null) throw new HttpError(404, ENDED);
  return created(req, signAnswer(raw));
}));
