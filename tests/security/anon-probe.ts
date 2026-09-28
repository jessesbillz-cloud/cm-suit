/// <reference types="node" />
// Anon probe (SPEC §6.8). Uses ONLY the anon / publishable key. Every attempt to read, write, call, list or download
// must be denied; public endpoints (SPEC §6.4) must refuse empty or unknown input and never answer 200 to it.
// Env: PROBE_SUPABASE_URL, PROBE_ANON_KEY. Exits non-zero on any failure.
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { BUCKETS, PUBLIC_TABLES, Report, ZERO_UUID, errText, makeClient, requireEnv, rowsOf } from './_lib';

const url = requireEnv('PROBE_SUPABASE_URL').replace(/\/+$/, '');
const anonKey = requireEnv('PROBE_ANON_KEY');
const anon = makeClient(url, anonKey);
const report = new Report(`Anon probe against ${url}`);

const U = ZERO_UUID;

/** Every function in schema public (supabase/migrations), with arguments that match its signature. */
const RPCS: [string, Record<string, unknown>][] = [
  ['assert_version', { p_table: 'projects', p_id: U, p_expected: 1 }],
  ['has_capability', { p_project_id: U, p_cap: 'bids.view_pricing' }],
  ['is_member', { p_project_id: U }],
  ['has_scope', { p_project_id: U, p_scope_type: 'module', p_scope_id: 'dailies' }],
  ['is_owner_of', { p_entity_type: 'file', p_entity_id: U }],
  ['is_org_admin', { p_org_id: U }],
  ['role_is_walled', { p_role: 'bidder' }],
  ['session_aal', {}],
  ['accept_invites', {}],
  ['people_display', { p_project_id: U }],
  ['my_projects', {}],
  ['next_number', { p_project_id: U, p_kind: 'rfi' }],
  ['next_author_number', { p_project_id: U, p_kind: 'daily' }],
  ['peek_author_number', { p_project_id: U, p_kind: 'daily' }],
  ['audit', { p_action: 'probe', p_entity_type: 'x', p_entity_id: U, p_project_id: U }],
  ['log_view', { p_entity_type: 'bid', p_entity_id: U, p_project_id: U }],
  ['sync_login_audit', {}],
  ['post_activity', { p_project_id: U, p_kind: 'probe', p_summary: 'probe', p_audience_capability: 'members.view' }],
  ['create_task', { p_project_id: U, p_assignee: U, p_kind: 'probe', p_title: 'probe' }],
  ['board_feed', {}],
  ['folder_effective_id', { p_folder_id: U }],
  ['folder_can_read', { p_folder_id: U }],
  ['folder_can_write', { p_folder_id: U }],
  ['file_storage_path', { p_project_id: U, p_folder_id: U, p_file_id: U, p_name: 'x.pdf' }],
  ['authorize_download', { p_file_id: U }],
  ['create_transmittal', { p_project_id: U, p_to_emails: [], p_to_members: [], p_file_ids: [], p_subject: '', p_message: '' }],
  ['enqueue_job', { p_kind: 'scan_file', p_payload: {}, p_project_id: U }],
  ['release_held_jobs', {}],
  ['worker_read_jobs', { p_limit: 1 }],
  ['worker_ack_job', { p_job_id: U, p_msg_id: 1 }],
  ['worker_fail_job', { p_job_id: U, p_msg_id: 1, p_error: 'probe' }],
  ['worker_heartbeat_ping', { p_version: 'probe' }],
  ['queue_health', {}],
  ['consume_rate_limit', { p_key: 'probe', p_capacity: 1, p_refill_per_sec: 1 }],
  ['resolve_access_link', { p_link_id: U, p_token_hash: 'x' }],
  ['sync_detected_timezone', { p_zone: 'America/Los_Angeles' }],
  // Bids (0011-0012)
  ['my_bidder_member_id', { p_project_id: U }],
  ['bids_open', { p_project_id: U }],
  ['set_bid_intent', { p_invite_id: U, p_intent: 'declined' }],
  ['mark_invite_opened', { p_project_id: U }],
  ['submit_bid', { p_package_id: U, p_file_id: U }],
  ['ask_bid_question', { p_project_id: U, p_package_id: U, p_question: 'probe' }],
  ['answer_bid_question', { p_question_id: U, p_question_text: 'probe', p_answer: 'probe' }],
  ['create_addendum', { p_project_id: U, p_title: 'probe', p_body: 'probe' }],
  ['issue_addendum', { p_addendum_id: U, p_content_hash: 'x' }],
  ['acknowledge_addendum', { p_addendum_id: U }],
  ['bidder_page', { p_project_id: U }],
  ['bid_coverage', { p_project_id: U }],
  // Leveling (0020)
  ['bid_leveling_board', { p_project_id: U }],
  ['bid_flags', { p_project_id: U }],
  ['set_bid_leveling', { p_submission_id: U, p_version: 0, p_patch: { comparable: false } }],
  // Company and job setup (0013-0014)
  ['create_org', { p_name: 'probe', p_kind: 'gc' }],
  ['create_project', { p_org_id: U, p_name: 'probe', p_stage: 'bidding' }],
  ['my_orgs', {}],
  // Sub directory (0018)
  ['can_manage_subs', { p_org_id: U }],
  ['merge_sub_contacts', { p_existing: [], p_incoming: [] }],
  ['import_subs', { p_org_id: U, p_rows: [] }],
  ['record_cslb_check', { p_sub_id: U, p_status: 'active', p_version: 1 }],
  // Calendar (0021-0022)
  ['calendar_mirror', { p_source_type: 'probe', p_source_id: U, p_project_id: U, p_kind: 'meetings', p_title: 'probe', p_starts_at: '2026-01-01T00:00:00Z' }],
  ['calendar_unmirror', { p_source_type: 'probe', p_source_id: U }],
  ['rotate_calendar_feed', {}],
  ['calendar_feed_lines', { p_token_hash: '0'.repeat(64) }],
  // Dailies (0023)
  ['save_daily_setup', { p_project_id: U, p_report_type: 'daily', p_settings: {} }],
  ['set_daily_start_number', { p_project_id: U, p_report_type: 'daily', p_start: 1 }],
  ['ensure_todays_draft', { p_project_id: U, p_report_type: 'daily', p_settings_if_new: {} }],
  ['create_daily_report', { p_project_id: U, p_report_type: 'daily', p_report_date: '2026-01-05' }],
  ['save_daily_content', { p_report_id: U, p_version: 1, p_content: {} }],
  ['delete_daily_draft', { p_report_id: U, p_version: 1 }],
  ['daily_photo_folder', { p_project_id: U }],
  ['add_daily_photo', { p_report_id: U, p_file_id: U, p_row_key: '', p_caption: '', p_taken_at: '2026-01-05T16:00:00Z' }],
  ['save_daily_photo', { p_photo_id: U, p_version: 1, p_caption: '' }],
  ['remove_daily_photo', { p_photo_id: U, p_version: 1 }],
  ['daily_reports_folder', { p_project_id: U }],
  ['begin_daily_submit', { p_report_id: U, p_version: 1, p_content_hash: '0'.repeat(64), p_photos_stamp: '' }],
  ['finish_daily_submit', { p_report_id: U, p_version: 1, p_content_hash: '0'.repeat(64), p_file_id: U, p_filename: 'x.pdf' }],
  ['daily_ensure_at', { p_project_id: U, p_report_type: 'daily', p_settings_if_new: {}, p_at: '2026-01-05T16:00:00Z' }],
  ['daily_author_folder', { p_project_id: U, p_author: U, p_kind: 'reports' }],
  ['daily_own_report', { p_report_id: U }],
  ['daily_local_date', { p_tz: 'America/Los_Angeles', p_at: '2026-01-05T16:00:00Z' }],
  ['daily_is_scheduled', { p_settings: {}, p_day: '2026-01-05' }],
  ['daily_carryover', { p_prev: {} }],
  // Inspections (0024)
  ['ir_setting', { p_project_id: U, p_key: 'ir_gc_approval' }],
  ['ir_status_key', { p_status: 'pending', p_result: 'approved', p_helper: U }],
  ['ir_type_label', { p_kind: 'ior', p_special: 'x' }],
  ['ir_when_label', { p_date: '2026-10-01', p_time: '09:00' }],
  ['ir_member_decides', { p_project_id: U, p_member: U }],
  ['ir_owner_ok', { p_project_id: U, p_owner: U }],
  ['ir_for_update', { p_request_id: U, p_version: 1 }],
  ['ir_first_status', { p_project_id: U }],
  ['ir_tell_inspector', { p_request: {}, p_kind: 'probe', p_summary: 'probe' }],
  ['ir_tell_requester', { p_request: {}, p_kind: 'probe', p_summary: 'probe' }],
  ['ir_decider', { p_request_id: U, p_version: 1 }],
  ['ir_folder', { p_project_id: U, p_which: 'attachments' }],
  ['ir_attach_folder_id', { p_project_id: U }],
  ['ir_form_context', { p_project_id: U }],
  ['ir_submit', { p_project_id: U, p_company: 'probe', p_request_date: '2030-01-01', p_kind: 'ior', p_items: 'probe', p_notice_ack: true }],
  ['ir_calendar', { p_project_id: U, p_from: '2030-01-01', p_to: '2030-01-07' }],
  ['ir_move', { p_request_id: U, p_version: 1, p_request_date: '2030-01-01' }],
  ['ir_withdraw', { p_request_id: U, p_version: 1 }],
  ['ir_restore', { p_request_id: U, p_version: 1 }],
  ['ir_gc_decide', { p_request_id: U, p_version: 1, p_approve: true }],
  ['ir_confirm', { p_request_id: U, p_version: 1 }],
  ['ir_unconfirm', { p_request_id: U, p_version: 1 }],
  ['ir_set_attendance', { p_request_id: U, p_version: 1 }],
  ['ir_set_result', { p_request_id: U, p_version: 1, p_result: 'approved' }],
  ['ir_postpone', { p_request_id: U, p_version: 1, p_reason: 'weather' }],
  ['ir_assign_helper', { p_request_id: U, p_version: 1 }],
  ['ir_claim', { p_request_id: U, p_version: 1 }],
  ['ir_helper_report', { p_request_id: U, p_version: 1, p_report: 'passed' }],
  ['ir_sign', { p_request_id: U, p_version: 1, p_content_hash: '0'.repeat(64) }],
  ['ir_attach_pdf', { p_request_id: U, p_file_id: U, p_content_hash: '0'.repeat(64), p_postponed: false }],
  ['ir_delete_pdf', { p_request_id: U, p_version: 1 }],
  ['authorize_ir_file', { p_request_id: U, p_file_id: U }],
  ['ir_recipients', { p_request_id: U }],
  ['ir_mark_sent', { p_request_id: U, p_transmittal_id: U }],
  // Deliveries (0025): member RPCs, the link's service-role-only SQL, and the internal helpers
  ['post_delivery', { p_project_id: U, p_company: 'probe', p_date: '2026-10-01', p_duration: 60, p_description: 'probe' }],
  ['update_delivery', { p_id: U, p_version: 1, p_company: 'probe', p_date: '2026-10-01', p_duration: 60, p_description: 'probe' }],
  ['delete_delivery', { p_id: U, p_version: 1, p_name: 'probe' }],
  ['restore_delivery', { p_id: U }],
  ['delivery_folder', { p_project_id: U }],
  ['attach_delivery_file', { p_delivery_id: U, p_file_id: U }],
  ['delivery_company_options', { p_project_id: U }],
  ['delivery_history', { p_delivery_id: U }],
  ['review_delivery_month', { p_project_id: U, p_month: '2026-10-01', p_name: 'probe', p_company: '' }],
  ['rotate_delivery_link', { p_project_id: U }],
  ['undo_delivery_link_rotation', { p_project_id: U }],
  ['delivery_link_state', { p_project_id: U }],
  ['link_delivery_board', { p_project_id: U, p_token_hash: 'x', p_from: '2026-10-01', p_to: '2026-10-02' }],
  ['link_post_delivery', { p_project_id: U, p_token_hash: 'x', p_name: 'probe', p_company: 'probe', p_date: '2026-10-01', p_duration: 60, p_description: 'probe' }],
  ['link_delivery_receipt', { p_project_id: U, p_token_hash: 'x', p_delivery_id: U }],
  ['delivery_overlaps', { p_project_id: U, p_starts_at: '2026-10-01T15:00:00Z', p_duration: 60, p_exclude: U }],
  ['delivery_company_list', { p_project_id: U }],
  ['delivery_company_id', { p_project_id: U, p_org_id: U, p_name: 'probe' }],
  ['delivery_clean', { p_text: 'probe', p_max: 10 }],
  ['delivery_insert', { p_project_id: U, p_company: 'probe', p_date: '2026-10-01', p_time: '07:00', p_duration: 60, p_description: 'probe', p_posted_name: 'probe', p_via_link: true }],
  ['delivery_link_project', { p_project_id: U, p_token_hash: 'x' }],
  // Folders by company kind (0027)
  ['add_template_folders', { p_project_id: U, p_applies: ['both'], p_created_by: U }],
  // Corrections (0026)
  ['correction_photo_folder', { p_project_id: U }],
  ['create_correction', { p_project_id: U, p_title: 'probe', p_request_key: 'probe' }],
  ['set_correction_status', { p_id: U, p_version: 1, p_status: 'ready' }],
  ['undo_correction', { p_id: U, p_version: 1 }],
  // Bid forms (0034)
  ['open_bid_forms', { p_project_id: U }],
];

/** Edge functions that require a signed-in user: no token means 401. */
const AUTHED_FUNCTIONS = [
  'download', 'invite-member', 'revoke-member', 'send-transmittal', 'queue-health',
  'invite-bidders', 'issue-addendum', 'extract-bid', 'import-subs', 'submit-daily', 'email-daily',
  'ir-pdf', 'ir-send',
];
/** SPEC §6.4 public endpoints built so far: an empty body is refused (never 200).
 *  Add request-link (Phase 3) when it ships. calendar-feed is GET-only, so a POST is a 400. */
const PUBLIC_FUNCTIONS = ['access', 'share', 'inbound-email', 'email-events', 'calendar-feed', 'delivery-board'];
const WEBHOOKS = ['inbound-email', 'email-events'];

async function probeTables(): Promise<void> {
  for (const t of PUBLIC_TABLES) {
    await report.guard('table', `${t}: select`, async () => {
      const res = await anon.from(t).select('*').limit(5);
      const n = rowsOf(res.data).length;
      report.check('table', `${t}: select denied or empty`, Boolean(res.error) || n === 0, res.error ? res.error.message : `${n} rows`);
    });
    await report.guard('table', `${t}: insert`, async () => {
      const { error, status } = await anon.from(t).insert({});
      report.check('table', `${t}: insert denied`, Boolean(error) && status >= 400, error ? `${status} ${error.message}` : `status ${status}`);
    });
  }
}

async function probeRpcs(): Promise<void> {
  for (const [name, args] of RPCS) {
    await report.guard('rpc', name, async () => {
      const { error, status } = await anon.rpc(name, args);
      const denied = Boolean(error) && [401, 403, 404].includes(status);
      report.check('rpc', `${name}: denied (401/403/404)`, denied, error ? `${status} ${error.message}` : `status ${status}`);
    });
  }
}

async function probeStorage(): Promise<void> {
  const path = `project/${U}/${U}/${U}/probe.pdf`;
  for (const b of BUCKETS) {
    await report.guard('storage', `${b}: list`, async () => {
      const { data, error } = await anon.storage.from(b).list('', { limit: 10 });
      const n = rowsOf(data).length;
      report.check('storage', `${b}: list denied or empty`, Boolean(error) || n === 0, error ? error.message : `${n} objects`);
    });
    await report.guard('storage', `${b}: list project/`, async () => {
      const { data, error } = await anon.storage.from(b).list('project', { limit: 10 });
      const n = rowsOf(data).length;
      report.check('storage', `${b}: list project/ denied or empty`, Boolean(error) || n === 0, error ? error.message : `${n} objects`);
    });
    await report.guard('storage', `${b}: signed url`, async () => {
      const { data, error } = await anon.storage.from(b).createSignedUrl(path, 60);
      report.check('storage', `${b}: createSignedUrl fails`, Boolean(error) && !data, error ? error.message : 'got a URL');
    });
    await report.guard('storage', `${b}: download`, async () => {
      const { data, error } = await anon.storage.from(b).download(path);
      report.check('storage', `${b}: download fails`, Boolean(error) && !data, error ? errText(error) : 'got bytes');
    });
    await report.guard('storage', `${b}: upload`, async () => {
      const { error } = await anon.storage.from(b).upload(`probe/${randomUUID()}.txt`, new Blob(['probe']), { upsert: false });
      report.check('storage', `${b}: upload fails`, Boolean(error), error ? error.message : 'upload accepted');
    });
  }
  await report.guard('storage', 'listBuckets', async () => {
    const { data, error } = await anon.storage.listBuckets();
    const n = rowsOf(data).length;
    report.check('storage', 'listBuckets denied or empty', Boolean(error) || n === 0, error ? error.message : `${n} buckets`);
  });
}

function callFunction(name: string, body: string | null, headers: Record<string, string> = {}): Promise<Response> {
  // apikey identifies the project to the gateway; it is not a user token. No Authorization header is sent.
  return fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json', ...headers },
    body,
  });
}

async function probeFunctions(): Promise<void> {
  for (const name of AUTHED_FUNCTIONS) {
    await report.guard('function', `${name}: no token`, async () => {
      const res = await callFunction(name, JSON.stringify({ project_id: U, file_id: U }));
      report.check('function', `${name}: no token -> 401`, res.status === 401, `status ${res.status}`);
    });
  }
  for (const name of PUBLIC_FUNCTIONS) {
    await report.guard('function', `${name}: empty body`, async () => {
      const res = await callFunction(name, null);
      report.check('function', `${name}: empty body -> 400/401/429`, [400, 401, 429].includes(res.status), `status ${res.status}`);
    });
  }
  for (const name of WEBHOOKS) {
    await report.guard('function', `${name}: no webhook secret`, async () => {
      // Well-formed Resend event with no Svix signature headers.
      const res = await callFunction(name, JSON.stringify({ type: 'email.delivered', data: { email_id: randomUUID(), to: [] } }));
      report.check('function', `${name}: no webhook secret -> 401`, res.status === 401, `status ${res.status}`);
    });
  }
  await report.guard('function', 'access: unknown link', async () => {
    // Well-formed but unknown: a 32-byte base64url token, like the ones invite-member mints.
    const res = await callFunction('access', JSON.stringify({ link_id: randomUUID(), token: randomBytes(32).toString('base64url') }));
    report.check('function', 'access: unknown link -> 404/401', [401, 404].includes(res.status), `status ${res.status}`);
    // Positive shape check: a refusal is JSON with an `error` field, and it leaks nothing else of note.
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch (e) {
      report.check('function', 'access: refusal is JSON', false, `not JSON (${errText(e)}): ${text.slice(0, 80)}`);
      return;
    }
    const hasError = typeof body === 'object' && body !== null && 'error' in body;
    report.check('function', 'access: refusal has an `error` field', hasError, text.slice(0, 120));
  });
  await probeCalendarFeed();
  await report.guard('function', 'unknown function', async () => {
    const res = await callFunction(`probe-${randomUUID().slice(0, 8)}`, '{}');
    report.check('function', 'unknown function is not 200', res.status !== 200, `status ${res.status}`);
  });
}

/** calendar-feed (SPEC §6.4 #7): calendar apps send no headers; a missing or unknown token is a bare 404, never a feed. */
async function probeCalendarFeed(): Promise<void> {
  const cases: [string, string][] = [
    ['no token', ''],
    ['malformed token', '?t=probe'],
    ['unknown token', `?t=${randomBytes(32).toString('base64url')}`],
  ];
  for (const [what, qs] of cases) {
    await report.guard('function', `calendar-feed: ${what}`, async () => {
      const res = await fetch(`${url}/functions/v1/calendar-feed${qs}`);
      const text = await res.text();
      report.check('function', `calendar-feed: ${what} -> 404/429`, [404, 429].includes(res.status), `status ${res.status}`);
      report.check('function', `calendar-feed: ${what} returns no calendar`, !text.includes('BEGIN:VCALENDAR'), text.slice(0, 80));
    });
  }
}

/** The delivery link's answer fields (SPEC §13.3: board fields only). */
const BOARD_FIELDS = ['company', 'delivery_date', 'description', 'duration_min', 'number', 'standby', 'starts_at'];

async function probeDeliveryLink(): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const today = new Date().toISOString().slice(0, 10);
  const board = (projectId: string, t: string) =>
    callFunction('delivery-board', JSON.stringify({ action: 'board', project_id: projectId, token: t, from: today, to: today }));
  await report.guard('function', 'delivery-board: unknown token', async () => {
    const res = await board(randomUUID(), token);
    const text = await res.text();
    report.check('function', 'delivery-board: unknown token -> 404', res.status === 404, `status ${res.status}`);
    report.check('function', 'delivery-board: refusal is JSON with an error', /"error"/.test(text), text.slice(0, 120));
  });
  await report.guard('function', 'delivery-board: malformed', async () => {
    const res = await board(randomUUID(), 'short');
    report.check('function', 'delivery-board: malformed token -> 400', res.status === 400, `status ${res.status}`);
    const del = await callFunction('delivery-board', JSON.stringify({ action: 'delete', project_id: randomUUID(), token }));
    report.check('function', 'delivery-board: no delete action (400)', del.status === 400, `status ${del.status}`);
  });
  // Positive check: a live link still opens its board, with board fields only. Staging sets both env vars.
  const projectId = process.env['PROBE_DELIVERY_PROJECT_ID'];
  const liveToken = process.env['PROBE_DELIVERY_TOKEN'];
  if (!projectId || !liveToken) {
    report.todo('function', 'delivery-board: live link opens its board', 'set PROBE_DELIVERY_PROJECT_ID and PROBE_DELIVERY_TOKEN');
    return;
  }
  await report.guard('function', 'delivery-board: live link', async () => {
    const res = await board(projectId, liveToken);
    report.check('function', 'delivery-board: live link -> 200', res.status === 200, `status ${res.status}`);
    const body = (await res.json()) as { deliveries?: Record<string, unknown>[] };
    const extra = (body.deliveries ?? []).flatMap((d) => Object.keys(d)).filter((k) => !BOARD_FIELDS.includes(k));
    report.check('function', 'delivery-board: board fields only', extra.length === 0, extra.join(', '));
  });
}

async function probeSchemas(): Promise<void> {
  for (const schema of ['pgmq', 'pgmq_public', 'queue']) {
    await report.guard('schema', schema, async () => {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: anonKey, 'Accept-Profile': schema },
      });
      report.check('schema', `${schema}: not exposed (406/404)`, [404, 406].includes(res.status), `status ${res.status}`);
    });
  }
  await report.guard('schema', 'queue table path', async () => {
    const res = await fetch(`${url}/rest/v1/jobs_index?select=*`, {
      headers: { apikey: anonKey, 'Accept-Profile': 'queue' },
    });
    report.check('schema', 'queue.jobs_index: not reachable', [404, 406].includes(res.status), `status ${res.status}`);
  });
  await report.guard('schema', 'pgmq table path', async () => {
    const res = await fetch(`${url}/rest/v1/q_jobs?select=*`, {
      headers: { apikey: anonKey, 'Accept-Profile': 'pgmq' },
    });
    report.check('schema', 'pgmq.q_jobs: not reachable', [404, 406].includes(res.status), `status ${res.status}`);
  });
}

async function main(): Promise<void> {
  await probeTables();
  await probeRpcs();
  await probeStorage();
  await probeFunctions();
  await probeDeliveryLink();
  await probeSchemas();
  report.finish();
}

main().catch((e: unknown) => {
  report.check('probe', 'ran to completion', false, errText(e));
  report.finish();
  process.exitCode = 1;
});
