// Mock no-login inspection requests (0055) for e2e: the same rules the request-link function and link_request_* apply,
// in short form. The outsider's day comes from the mock calendar with everything but time, length, type and color left
// out; a request goes into the mock inspections store with no member behind it (the inspector sees it like any other;
// an OFS request answers the special inspection question and starts with the GC: 0061); receipts live in sessionStorage
// under their own key, like the rest of the mock. The revs request and a request's map by its receipt (0057) are
// mock/requestNoLoginRevs, on the receipts kept here.
import { parseProjectSettings } from '../../lib/settings';
import { FunctionError } from '../functions';
import type { IrRequest, IrRowRaw } from '../inspections.types';
import type { LinkKey } from '../requestLink.types';
import type { PublicDayAnswer, PublicIr, PublicRequestInput, RequestFacts, Submitted } from '../requestNoLogin.types';
import { addUploadedFile } from './api';
import { MOCK_PROJECTS } from './fixtures';
import { permitJobName } from './permitJobs';
import { addLinkRequest, folder, formContext, serverDay, serverRequest } from './inspections';
import { projectSettings } from './jobs';
import { wording } from './ofsRules';
import { jobFor } from './requestLink';
import { sheetUrl } from './sheet';
import { delay } from './store';

const KEY = 'e2e-mock-request-receipts';
const GONE = 'That request is not available.';

function receipts(): Record<string, string> {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, string>);
}

/** 32 random bytes as base64url (43 characters), the shape of every link token. */
function newReceipt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function refuse(status: number, message: string): FunctionError {
  return new FunctionError(status, status === 404 ? 'not_found' : 'bad_request', message, null, null);
}

/** The function's calendar answer: the day and its rows as an outsider sees them, and the form's choices. */
export async function day(key: LinkKey, picked: string | null): Promise<PublicDayAnswer> {
  await delay();
  jobFor(key);
  const ctx = await formContext(key.projectId);
  const d = picked ?? ctx.today;
  if (d < ctx.today) throw refuse(400, 'Pick today or a later day.');
  const rows = (await serverDay(key.projectId, d)).map((r) => ({
    start_time: r.start_time, duration_kind: r.duration_kind, duration_min: r.duration_min, kind: r.kind, status_key: r.status_key,
  }));
  return { today: ctx.today, day: d, ofs: ctx.ofs, attest_text: wording(key.projectId), kinds: ctx.kinds, rows };
}

/** The job's name, a sample job or the fire marshal's. */
export function jobName(projectId: string): string {
  return MOCK_PROJECTS.find((p) => p.project_id === projectId)?.name ?? permitJobName(projectId);
}

function facts(projectId: string, r: IrRowRaw | IrRequest, special: string | null): RequestFacts {
  return {
    project_name: jobName(projectId),
    number: r.number, request_date: r.request_date, start_time: r.start_time, duration_kind: r.duration_kind,
    duration_min: r.duration_min, kind: r.kind, special_kind: special, status: r.status, result: r.result,
    result_note: r.result_note,
    // link_request_answer: the job has the GC step on or this request went through it; whether it is with OFS.
    gc_step: parseProjectSettings(projectSettings(projectId)).ir_gc_approval || r.gc_at !== null,
    ofs_sent: r.ofs_sent_at !== null,
    // 0075: the postponement while postponed, the attendance call, whether the IR is made.
    postpone_reason: r.status === 'postponed' ? r.postpone_reason : null,
    postpone_note: r.status === 'postponed' ? r.postpone_note : null,
    postpone_until: r.status === 'postponed' ? r.postpone_until : null,
    attendance: r.attendance,
    has_ir: r.ir_file_id !== null,
  };
}

export async function submit(key: LinkKey, v: PublicRequestInput): Promise<Submitted> {
  await delay();
  jobFor(key);
  if (v.items.trim() === '' || v.contact.name.trim() === '' || (v.contact.phone.trim() === '' && v.contact.email.trim() === '')) {
    throw refuse(400, 'Invalid request');
  }
  if (v.files.length > 3) throw refuse(400, 'Up to 3 photos or PDFs.');
  const files = [];
  for (const f of v.files) files.push(await addUploadedFile(key.projectId, folder(key.projectId), f.name, f.type, f.size));
  const row = await addLinkRequest(
    {
      p_project_id: key.projectId, p_company: v.contact.company.trim(), p_request_date: v.date, p_kind: v.kind,
      p_items: v.items.trim(), p_start_time: v.startTime, p_duration_kind: v.durationKind, p_duration_min: v.durationMin,
      p_special_kind_id: v.kind === 'special' ? v.specialKindId : null, p_attachment_ids: files.map((f) => f.id),
      p_notice_ack: true, p_special_required: v.kind === 'ofs' ? v.specialRequired : null,
    },
    { name: v.contact.name.trim(), phone: v.contact.phone.trim(), email: v.contact.email.trim() },
  );
  const special = (await formContext(key.projectId)).kinds.find((k) => k.id === row.special_kind_id)?.name ?? null;
  return submitted(key.projectId, row, special);
}

/** The answer to a request just made: its facts and a new receipt (kept, like the database keeps its hash). */
export function submitted(projectId: string, row: IrRowRaw, special: string | null): Submitted {
  const receipt = newReceipt();
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...receipts(), [receipt]: row.id }));
  return { ...facts(projectId, row, special), receipt };
}

/** The request a receipt opens on its job, or the function's 404. */
export async function receiptRequest(projectId: string, receipt: string): Promise<IrRequest> {
  const id = receipts()[receipt];
  const row = id === undefined ? null : await serverRequest(id);
  if (!row || row.project_id !== projectId) throw refuse(404, GONE);
  return row;
}

export async function status(projectId: string, receipt: string): Promise<RequestFacts> {
  await delay();
  const row = await receiptRequest(projectId, receipt);
  return facts(projectId, row, row.ir_special_kinds?.name ?? null);
}

/** link_request_ir_file by the receipt: the IR once made (a synthetic PDF), else the database's refusal. */
export async function ir(projectId: string, receipt: string): Promise<PublicIr> {
  await delay();
  const row = await receiptRequest(projectId, receipt);
  if (row.ir_file_id === null) throw refuse(400, 'There is no IR yet.');
  const [y, mo, d] = row.request_date.split('-');
  return { url: sheetUrl(), filename: `IR ${String(row.number)} ${jobName(projectId)} ${mo ?? ''}-${d ?? ''}-${y ?? ''}.pdf` };
}
