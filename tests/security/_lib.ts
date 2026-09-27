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
  'bid_leveling', 'bid_questions', 'published_answers', 'addenda', 'addendum_acks',
] as const;

/** Every storage bucket created by the migrations. */
export const BUCKETS = ['files', 'signatures', 'inbound', 'fixtures'] as const;

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
