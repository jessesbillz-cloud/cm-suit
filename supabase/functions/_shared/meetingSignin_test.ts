// `deno test supabase/functions/_shared/meetingSignin_test.ts` — the meeting sign-in page's request and answer whitelist.
import { MeetingSigninBody, openAnswer, signAnswer, signatureSchema } from './meetingSignin.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
  } catch (e) {
    return e instanceof Error;
  }
  return false;
}

const TOKEN = 'A'.repeat(43);
const MEETING = '00000000-0000-4000-8000-000000000001';
const SIG = [[[0.1, 0.5], [0.2, 0.4], [0.3, 0.6]], [[0.5, 0.5]]];

function sign(over: Record<string, unknown> = {}) {
  return { action: 'sign', meeting_id: MEETING, token: TOKEN, name: ' Sample Laborer ', company: 'Sample Framing', trade: '', signature: SIG, ...over };
}

Deno.test('open answer: the page\'s facts only, never a name or an id', () => {
  const out = openAnswer({
    project_name: 'Sample Job', number: 12, kind: 'tailgate', title: 'Heat illness', held_on: '2026-10-05', open: true,
    leader_name: 'Sam Sample', org_id: MEETING, attendees: ['Someone'],
  });
  check(JSON.stringify(Object.keys(out).sort()) === JSON.stringify(['held_on', 'kind', 'number', 'open', 'project_name', 'title']), 'keys');
  check(throws(() => openAnswer({ project_name: 'x', number: 1, kind: 'party', title: 'x', held_on: '2026-10-05', open: true })), 'kind');
});

Deno.test('sign answer: the status only', () => {
  const out = signAnswer({ status: 'signed', id: MEETING, name: 'Someone' });
  check(JSON.stringify(out) === '{"status":"signed"}', 'status only');
  check(throws(() => signAnswer({ status: 'removed' })), 'only signed');
});

Deno.test('sign: name, company, trade and strokes; names are trimmed', () => {
  const ok = MeetingSigninBody.safeParse(sign());
  check(ok.success && ok.data.action === 'sign' && ok.data.name === 'Sample Laborer', 'a good signature');
  check(!MeetingSigninBody.safeParse(sign({ name: '  ' })).success, 'a name');
  check(!MeetingSigninBody.safeParse(sign({ company: '' })).success, 'a company');
  check(!MeetingSigninBody.safeParse(sign({ trade: 'x'.repeat(81) })).success, 'a short trade');
  check(!MeetingSigninBody.safeParse(sign({ token: 'short' })).success, 'a token of 43 characters');
  check(!MeetingSigninBody.safeParse(sign({ person_id: MEETING })).success, 'nothing else (strict)');
  check(!MeetingSigninBody.safeParse({ action: 'list', meeting_id: MEETING, token: TOKEN }).success, 'no other action');
});

Deno.test('signature: points inside the pad, a few thousand at most, more than a dot', () => {
  check(signatureSchema.safeParse(SIG).success, 'strokes of points');
  check(!signatureSchema.safeParse([[[0.5, 0.5]]]).success, 'a dot is not a signature');
  check(!signatureSchema.safeParse([[[1.2, 0.5], [0.1, 0.1]]]).success, 'inside the pad');
  check(!signatureSchema.safeParse([[[0.1, 0.1, 0.1], [0.2, 0.2]]]).success, 'two numbers a point');
  check(!signatureSchema.safeParse([]).success, 'at least one stroke');
  const long = Array.from({ length: 3 }, () => Array.from({ length: 1001 }, (_, i): [number, number] => [i / 1001, 0.5]));
  check(!signatureSchema.safeParse(long).success, '3000 points at most');
  check(!signatureSchema.safeParse(Array.from({ length: 81 }, () => [[0.1, 0.1], [0.2, 0.2]])).success, '80 strokes at most');
});
