/// <reference types="node" />
// Shared plumbing for the security probes (SPEC §6.8): env, clients, a check recorder that prints a table,
// and the object lists derived from supabase/migrations. Update the lists in the same PR as the migration.
import process from 'node:process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}. The probe refuses to run without it.`);
  return v;
}

// The probes poke every table and RPC on purpose, so the client is deliberately untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Client = SupabaseClient<any, any, any, any, any>;

export function makeClient(url: string, key: string): Client {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any, any, any>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type Status = 'PASS' | 'FAIL' | 'TODO';
interface Row {
  area: string;
  check: string;
  status: Status;
  detail: string;
}

export class Report {
  private readonly rows: Row[] = [];

  constructor(private readonly title: string) {}

  check(area: string, check: string, ok: boolean, detail = ''): void {
    this.rows.push({ area, check, status: ok ? 'PASS' : 'FAIL', detail });
  }

  todo(area: string, check: string, detail: string): void {
    this.rows.push({ area, check, status: 'TODO', detail });
  }

  /** Records a thrown error as a failed check instead of aborting the whole probe. */
  async guard(area: string, check: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.check(area, check, false, `threw: ${errText(e)}`);
    }
  }

  get failures(): number {
    return this.rows.filter((r) => r.status === 'FAIL').length;
  }

  print(): void {
    const w = (k: keyof Row, max: number) => Math.min(max, Math.max(k.length, ...this.rows.map((r) => r[k].length)));
    const wa = w('area', 18);
    const wc = w('check', 70);
    const line = (a: string, c: string, s: string, d: string) =>
      `${a.slice(0, wa).padEnd(wa)}  ${c.slice(0, wc).padEnd(wc)}  ${s.padEnd(6)}  ${d}\n`;
    let out = `\n${this.title}\n`;
    out += line('area', 'check', 'status', 'detail');
    out += `${'-'.repeat(wa)}  ${'-'.repeat(wc)}  ------  ------\n`;
    for (const r of this.rows) out += line(r.area, r.check, r.status, r.detail);
    const todo = this.rows.filter((r) => r.status === 'TODO').length;
    out += `\n${this.rows.length} checks: ${this.rows.length - this.failures - todo} passed, ${this.failures} failed, ${todo} todo\n`;
    process.stdout.write(out);
  }

  /** Prints the table and sets a non-zero exit code on any failure. In GitHub Actions each failure is also an annotation. */
  finish(): void {
    this.print();
    if (process.env['GITHUB_ACTIONS'] === 'true') {
      for (const r of this.rows.filter((x) => x.status === 'FAIL')) {
        const msg = `${r.area}: ${r.check} -- ${r.detail}`.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
        process.stdout.write(`::error title=${this.title.replace(/[:,\n]/g, ' ')}::${msg}\n`);
      }
    }
    if (this.failures > 0) process.exitCode = 1;
  }
}

export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e);
}

/** supabase-js returns untyped rows without generated types; narrow them here once. */
export function rowsOf(data: unknown): Record<string, unknown>[] {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) return [data as Record<string, unknown>];
  return data as Record<string, unknown>[];
}

/** Every table in schema public, from supabase/migrations (Phase 0). */
export const PUBLIC_TABLES = [
  'roles', 'role_permissions', 'orgs', 'org_members', 'profiles', 'projects', 'project_members', 'member_scopes',
  'user_layout', 'owner_lookup', 'project_counters', 'author_counters', 'audit_events', 'login_sync_state', 'activity',
  'activity_recipients', 'read_marks', 'tasks', 'folders', 'folder_access', 'files', 'file_pages', 'downloads',
  'share_links', 'transmittals', 'job_kinds', 'dead_jobs', 'worker_heartbeat', 'rate_limits', 'access_links',
  'email_outbound', 'email_suppressions', 'email_events', 'email_inbound', 'push_subscriptions', 'ai_calls',
  'bid_packages', 'subs', 'sub_history', 'bid_invites', 'bid_submissions', 'bid_extractions', 'bid_extraction_pricing',
  'bid_leveling', 'bid_questions', 'published_answers', 'addenda', 'addendum_acks', 'signin_allowlist',
  'calendar_entries', 'calendar_feed_tokens',
  'daily_setups', 'daily_reports', 'daily_report_photos', 'daily_author_folders',
  'inspection_requests', 'ir_events', 'ir_blocks', 'ir_special_kinds',
  // Deliveries (0025)
  'deliveries', 'delivery_companies', 'delivery_reviews', 'delivery_link_log',
  'folder_templates',
  // Corrections (0026)
  'corrections', 'correction_history',
  // CSI reference (0033)
  'csi_divisions', 'csi_sections',
  // Bid forms (0034)
  'bid_form_templates', 'bid_form_items',
  // Company invites (0035)
  'org_invites',
  // Testing login (0036)
  'security_switches', 'signin_keys',
  // Testing "View as" (0039)
  'testing_superusers', 'testing_role_home',
  // RFIs (0038)
  'rfi_settings', 'rfi_route_steps', 'rfis', 'rfi_steps', 'rfi_events',
  // Hours, billing and invoices (0043)
  'job_hours_budgets', 'billing_profiles', 'billing_job_rates', 'invoices',
  // Request link and hub (0046)
  'request_link_log', 'request_hubs',
  // Each job's tools on the rail (0051)
  'user_job_rail',
  // Comments (0050)
  'comments', 'comment_edits',
  // Permits (0052)
  'permits', 'permit_stage_events', 'permit_reviews', 'permit_comments',
  // Permit stamp (0053)
  'permit_approved_sets',
  // The server's record of each stamped copy (0054)
  'permit_stamped_copies',
  // A no-login request's private status link: only its token's hash (0055)
  'ir_link_receipts',
  // Revs (0056)
  'rev_lists', 'revs', 'rev_items', 'rev_areas', 'rev_marks', 'ir_rev_items', 'ir_maps',
] as const;

/** Every storage bucket created by the migrations. */
export const BUCKETS = ['files', 'signatures', 'inbound', 'fixtures', 'org-logos'] as const;

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** The permit stamp RPCs (0053) for the anon probe (kept here: anon-probe.ts is at its line limit). */
export const PERMIT_STAMP_RPCS: [string, Record<string, unknown>][] = [
  ['permit_stamp_folders', { p_permit_id: ZERO_UUID }],
  ['permit_stamp_source', { p_permit_id: ZERO_UUID, p_file_id: ZERO_UUID }],
  ['permit_stamp_sources', { p_permit_id: ZERO_UUID }],
  ['permit_record_stamped_set', { p_permit_id: ZERO_UUID, p_version: 1, p_stamped_file_ids: [] }],
  ['permit_approved', { p_permit_id: ZERO_UUID }],
  ['permit_stamp_mode', { p_stage: 'in_review' }],
  ['permit_folder_make', { p_project_id: ZERO_UUID, p_parent_id: ZERO_UUID, p_name: 'probe', p_kind: 'approved_plans', p_sort: 1 }],
  ['permit_folder_ensure', {
    p_project_id: ZERO_UUID, p_parent_id: ZERO_UUID, p_kind: 'approved_plans', p_name: 'probe', p_sort: 1, p_cap: null,
    p_read: false, p_write: false,
  }],
  ['permit_approved_root', { p_project_id: ZERO_UUID }],
  ['permit_set_folder', { p_permit_id: ZERO_UUID }],
  // The security fixes (0054): the comment read gate, the board's comment gate, the server's part of Approved plans.
  ['comment_readable', { p_project_id: ZERO_UUID, p_entity_type: 'rfi', p_entity_id: ZERO_UUID }],
  ['board_line_readable', { p_kind: 'comment.added', p_project_id: ZERO_UUID, p_entity_type: 'rfi', p_entity_id: ZERO_UUID }],
  ['folder_server_only', { p_folder_id: ZERO_UUID }],
];

/** No-login inspection requests (0055) for the anon probe: the link's SQL surface and its internal helpers. */
export const REQUEST_NO_LOGIN_RPCS: [string, Record<string, unknown>][] = [
  ['link_request_calendar', { p_project_id: ZERO_UUID, p_token_hash: 'x', p_hub_id: null, p_day: null }],
  ['link_request_files', { p_project_id: ZERO_UUID, p_token_hash: 'x', p_hub_id: null, p_files: [] }],
  ['link_request_submit', {
    p_project_id: ZERO_UUID, p_token_hash: 'x', p_hub_id: null, p_name: 'probe', p_company: 'probe', p_phone: '5550100000',
    p_email: null, p_request_date: '2030-01-01', p_kind: 'ior', p_items: 'probe', p_notice_ack: true,
  }],
  ['link_request_status', { p_project_id: ZERO_UUID, p_receipt_hash: 'x' }],
  ['link_request_answer', { p_request_id: ZERO_UUID }],
  ['ir_folder_make', { p_project_id: ZERO_UUID, p_which: 'attachments' }],
  ['ir_calendar_rows', { p_project_id: ZERO_UUID, p_from: '2030-01-01', p_to: '2030-01-01', p_viewer: null, p_team: true, p_decide: true }],
  ['requester_backfill', {}],
];

/** The request link's no-login actions, refused without a live token (anon probe cases: what, body, statuses). */
export function requestNoLoginCases(token: string, projectId: string): [string, Record<string, unknown>, number[]][] {
  return [
    ['calendar with an unknown token', { action: 'calendar', project_id: projectId, token }, [404]],
    ['calendar on a malformed day', { action: 'calendar', project_id: projectId, token, day: 'today' }, [400]],
    ['status with an unknown receipt', { action: 'status', project_id: projectId, receipt: token }, [404]],
    ['submit as JSON, not a form', { action: 'submit', project_id: projectId, token, name: 'probe', company: 'probe' }, [400]],
    // Revs from the link (0057): the walls by the link token, a map by its receipt only.
    ['revs with an unknown token', { action: 'revs', project_id: projectId, token }, [404]],
    ['map with an unknown receipt', { action: 'map', project_id: projectId, receipt: token }, [404]],
    ['map save with an unknown receipt', {
      action: 'map_save', project_id: projectId, receipt: token, version: 1, strokes: [], sheet_file_id: null, page: null,
    }, [404]],
    ['sheet with an unknown receipt', { action: 'sheet', project_id: projectId, receipt: token }, [404]],
    ['map render with an unknown receipt', { action: 'map_render', project_id: projectId, receipt: token }, [404]],
    ['map download with an unknown receipt', { action: 'map_download', project_id: projectId, receipt: token }, [404]],
    ['map by a request id, not a receipt', { action: 'map', project_id: projectId, request_id: projectId }, [400]],
  ];
}

/** Revs from the link (0057) for the anon probe: the link's SQL surface and its internal helpers. */
export const LINK_REVS_RPCS: [string, Record<string, unknown>][] = [
  ['link_request_revs', { p_project_id: ZERO_UUID, p_token_hash: 'x', p_hub_id: null }],
  ['link_request_submit_ofs', {
    p_project_id: ZERO_UUID, p_token_hash: 'x', p_hub_id: null, p_name: 'probe', p_company: 'probe', p_phone: '5550100000',
    p_email: null, p_request_date: '2030-01-01', p_notice_ack: true, p_area_ids: [ZERO_UUID], p_item_ids: [ZERO_UUID],
  }],
  ['link_request_map', { p_project_id: ZERO_UUID, p_receipt_hash: 'x' }],
  ['link_request_map_save', { p_project_id: ZERO_UUID, p_receipt_hash: 'x', p_version: 1, p_strokes: [] }],
  ['link_request_map_facts', { p_project_id: ZERO_UUID, p_receipt_hash: 'x' }],
  ['link_request_map_file', { p_project_id: ZERO_UUID, p_receipt_hash: 'x', p_which: 'sheet', p_ip: null }],
  ['link_request_receipt', { p_project_id: ZERO_UUID, p_receipt_hash: 'x' }],
  ['link_request_map_editor', { p_request_id: ZERO_UUID }],
  ['link_request_map_sheets', { p_request_id: ZERO_UUID }],
  ['link_request_map_view', { p_request_id: ZERO_UUID }],
  ['ir_ofs_open_text', { p_project_id: ZERO_UUID, p_area_ids: [], p_item_ids: [] }],
  ['rev_walls_sheet_ok', { p_project_id: ZERO_UUID, p_area_ids: [], p_file_id: ZERO_UUID }],
  ['rev_status_rows', { p_project_id: ZERO_UUID }],
  ['ir_map_facts', { p_request_id: ZERO_UUID }],
];

/** Revs (0056) for the anon probe: the RPCs, the service-only map record, and the internal helpers. */
export const REVS_RPCS: [string, Record<string, unknown>][] = [
  ['rev_status', { p_project_id: ZERO_UUID }],
  ['rev_list_create', { p_project_id: ZERO_UUID, p_name: 'probe', p_phase: null, p_permit_id: null, p_revs: [] }],
  ['rev_list_save', { p_id: ZERO_UUID, p_version: 1, p_name: 'probe', p_phase: null, p_permit_id: null }],
  ['rev_save', { p_list_id: ZERO_UUID, p_id: null, p_version: null, p_number: 0, p_name: 'probe' }],
  ['rev_item_save', { p_rev_id: ZERO_UUID, p_id: null, p_version: null, p_name: 'probe', p_company: null, p_position: null }],
  ['rev_areas_add', { p_list_id: ZERO_UUID, p_level: 'probe', p_names: ['probe'], p_sheet_file_id: null }],
  ['rev_area_save', { p_id: ZERO_UUID, p_version: 1, p_level: 'probe', p_name: 'probe', p_sheet_file_id: null, p_position: null }],
  ['rev_remove', { p_kind: 'list', p_id: ZERO_UUID, p_version: 1 }],
  ['rev_restore', { p_kind: 'list', p_id: ZERO_UUID, p_version: 1 }],
  ['rev_mark_na', { p_area_id: ZERO_UUID, p_item_id: ZERO_UUID, p_on: true }],
  ['ir_submit_ofs', {
    p_project_id: ZERO_UUID, p_company: 'probe', p_request_date: '2030-01-01', p_notice_ack: true, p_area_ids: [ZERO_UUID],
    p_item_ids: [ZERO_UUID],
  }],
  ['ir_map_context', { p_request_id: ZERO_UUID }],
  ['ir_map_save', { p_request_id: ZERO_UUID, p_version: 1, p_strokes: [] }],
  ['ir_map_attach', { p_request_id: ZERO_UUID, p_file_id: ZERO_UUID, p_content_hash: '0'.repeat(64), p_signed: false }],
  ['ir_rev_results', { p_request_id: ZERO_UUID, p_version: 1, p_results: [] }],
  ['ir_map_strokes_ok', { p_strokes: [] }],
  ['rev_clean', { p_text: 'probe' }],
  ['rev_need', { p_project_id: ZERO_UUID, p_cap: 'revs.read' }],
  ['rev_version_ok', { p_have: 1, p_want: 1 }],
  ['rev_sheet_ok', { p_project_id: ZERO_UUID, p_file_id: ZERO_UUID }],
  ['rev_sheet_check', { p_project_id: ZERO_UUID, p_file_id: ZERO_UUID }],
  ['rev_list_check', { p_project_id: ZERO_UUID, p_name: 'probe', p_phase: null, p_permit_id: null }],
  ['rev_rev_check', { p_number: 0, p_name: 'probe' }],
  ['rev_item_check', { p_name: 'probe', p_company: null }],
  ['rev_area_check', { p_level: 'probe', p_name: 'probe' }],
  ['rev_legend_check', { p_revs: [] }],
  ['rev_free_number', { p_list_id: ZERO_UUID, p_number: 0, p_except: null }],
  ['rev_list_lock', { p_list_id: ZERO_UUID, p_version: 1 }],
  ['rev_lock', { p_rev_id: ZERO_UUID }],
  ['rev_table', { p_kind: 'list' }],
  ['ir_ofs_cells', { p_project_id: ZERO_UUID, p_area_ids: [], p_item_ids: [] }],
  ['ir_ofs_list', { p_project_id: ZERO_UUID, p_area_ids: [], p_item_ids: [] }],
  ['ir_ofs_items_text', { p_area_ids: [], p_item_ids: [] }],
  ['ir_map_what', { p_request_id: ZERO_UUID }],
  ['ir_rev_failed_notes', { p_request_id: ZERO_UUID }],
  ['ir_rev_results_check', { p_request_id: ZERO_UUID, p_results: [] }],
  ['ir_map_editor', { p_request_id: ZERO_UUID }],
  // Walls on the plan (0059): drawing, placing, the plan sheet, and the internal checks.
  ['rev_area_draw', { p_list_id: ZERO_UUID, p_level: 'probe', p_name: 'probe', p_sheet_file_id: ZERO_UUID, p_page: 1, p_geom: [[0, 0], [1, 1]] }],
  ['rev_area_place', { p_id: ZERO_UUID, p_version: 1, p_sheet_file_id: null, p_page: 1, p_geom: null }],
  ['authorize_rev_sheet', { p_project_id: ZERO_UUID, p_file_id: ZERO_UUID }],
  ['rev_geom_ok', { p_geom: [[0, 0], [1, 1]] }],
  ['rev_geom_check', { p_project_id: ZERO_UUID, p_sheet_file_id: ZERO_UUID, p_page: 1, p_geom: [[0, 0], [1, 1]], p_was: null }],
  ['rev_wall_sheet', { p_project_id: ZERO_UUID, p_file_id: ZERO_UUID }],
];
