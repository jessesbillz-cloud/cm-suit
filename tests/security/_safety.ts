/// <reference types="node" />
// Anon probe, Safety (migration 0060, SPEC §6.4 #8): every Safety RPC is refused with no session, and the public
// meeting-signin function refuses a wrong or malformed token, an unknown action and a signature that isn't one, always
// with a JSON error (never a 200). Kept here: anon-probe.ts is at its line limit, and it imports these through _lib.ts
// (which re-exports them), so this file imports nothing from _lib at run time (types only: no import cycle).
import { randomBytes, randomUUID } from 'node:crypto';
import type { Report } from './_lib';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** The Safety RPCs for the anon probe: the member RPCs, the link surface, the service-only record and the helpers. */
export const SAFETY_RPCS: [string, Record<string, unknown>][] = [
  ['safety_folder', { p_project_id: ZERO_UUID }],
  ['safety_topic_save', {
    p_project_id: ZERO_UUID, p_id: null, p_version: null, p_category: 'site', p_title: 'probe', p_points: ['probe'], p_questions: [],
    p_source: null, p_source_url: null, p_file_id: null,
  }],
  ['safety_topic_remove', { p_project_id: ZERO_UUID, p_id: ZERO_UUID, p_removed: true }],
  ['safety_topic_file', { p_project_id: ZERO_UUID, p_topic_id: ZERO_UUID }],
  ['safety_meeting_start', {
    p_project_id: ZERO_UUID, p_key: ZERO_UUID, p_kind: 'tailgate', p_topic_id: null, p_title: 'probe', p_notes: '', p_file_id: null,
    p_location: '',
  }],
  ['safety_meeting_qr', { p_meeting_id: ZERO_UUID }],
  ['safety_tick', { p_meeting_id: ZERO_UUID, p_person: ZERO_UUID }],
  ['safety_signin_remove', { p_signin_id: ZERO_UUID, p_removed: true }],
  ['safety_meeting_close', { p_meeting_id: ZERO_UUID, p_version: 1 }],
  ['safety_meeting_reopen', { p_meeting_id: ZERO_UUID }],
  ['safety_meetings_list', { p_project_id: ZERO_UUID }],
  ['safety_meeting', { p_meeting_id: ZERO_UUID }],
  ['safety_due', { p_project_id: ZERO_UUID }],
  ['safety_meeting_sheet', { p_meeting_id: ZERO_UUID }],
  ['safety_org_can', { p_org_id: ZERO_UUID, p_cap: 'safety.read' }],
  ['safety_meeting_attach', { p_meeting_id: ZERO_UUID, p_file_id: ZERO_UUID, p_content_hash: '0'.repeat(64) }],
  ['link_meeting_open', { p_meeting_id: ZERO_UUID, p_token_hash: 'x' }],
  ['link_meeting_sign', {
    p_meeting_id: ZERO_UUID, p_token_hash: 'x', p_name: 'probe', p_company: 'probe', p_trade: '', p_signature: [[[0, 0], [1, 1]]],
  }],
  ['safety_tailgate_check', {}],
  ['safety_folder_make', { p_project_id: ZERO_UUID }],
  ['safety_category_ok', { p_category: 'site' }],
  ['safety_lines_ok', { p_lines: [], p_max: 1 }],
  ['safety_signature_ok', { p_sig: [] }],
  ['safety_due_on', { p_project_id: ZERO_UUID, p_today: '2030-01-01' }],
  ['safety_kind_label', { p_kind: 'tailgate' }],
  ['safety_person_name', { p_person: ZERO_UUID }],
  ['safety_lead_lock', { p_meeting_id: ZERO_UUID }],
  ['safety_file_ok', { p_org_id: ZERO_UUID, p_project_id: ZERO_UUID, p_file_id: ZERO_UUID }],
  ['safety_new_token', { p_meeting_id: ZERO_UUID }],
];

type Call = (name: string, body: string | null) => Promise<Response>;

/** meeting-signin with no session: every refusal is JSON with an error, never a 200. */
export async function probeMeetingSignin(report: Report, call: Call): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const meeting = randomUUID();
  const sig = [[[0.1, 0.5], [0.3, 0.4]]];
  const cases: [string, Record<string, unknown> | null, number[]][] = [
    ['open with an unknown token', { action: 'open', meeting_id: meeting, token }, [404]],
    ['open with a malformed token', { action: 'open', meeting_id: meeting, token: 'short' }, [400]],
    ['sign with an unknown token', { action: 'sign', meeting_id: meeting, token, name: 'probe', company: 'probe', trade: '', signature: sig }, [404]],
    ['sign with a dot for a signature', {
      action: 'sign', meeting_id: meeting, token, name: 'probe', company: 'probe', trade: '', signature: [[[0.5, 0.5]]],
    }, [400]],
    ['sign naming a person', {
      action: 'sign', meeting_id: meeting, token, name: 'probe', company: 'probe', trade: '', signature: sig, person_id: meeting,
    }, [400]],
    ['no list action', { action: 'list', meeting_id: meeting, token }, [400]],
  ];
  for (const [what, body, expected] of cases) {
    await report.guard('function', `meeting-signin: ${what}`, async () => {
      const res = await call('meeting-signin', body === null ? null : JSON.stringify(body));
      const text = await res.text();
      report.check('function', `meeting-signin: ${what} -> ${expected.join('/')}`, expected.includes(res.status) || res.status === 429,
        `status ${res.status}`);
      report.check('function', `meeting-signin: ${what} refusal is JSON with an error`, /"error"/.test(text), text.slice(0, 120));
    });
  }
}
