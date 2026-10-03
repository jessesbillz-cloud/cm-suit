// Mock no-login inspection requests (0055) for e2e: the same rules the request-link function and link_request_* apply,
// in short form. The outsider's day comes from the mock calendar with everything but time, length, type and color left
// out; a request goes into the mock inspections store with no member behind it (the inspector sees it like any other);
// receipts live in sessionStorage under their own key, like the rest of the mock.
import { FunctionError } from '../functions';
import type { IrRequest, IrRowRaw } from '../inspections.types';
import type { LinkKey } from '../requestLink.types';
import type { PublicDayAnswer, PublicRequestInput, RequestFacts, Submitted } from '../requestNoLogin.types';
import { addUploadedFile } from './api';
import { MOCK_PROJECTS } from './fixtures';
import { addLinkRequest, calendar, folder, formContext, request } from './inspections';
import { jobFor } from './requestLink';
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

function refuse(status: number, message: string): FunctionError {
  return new FunctionError(status, status === 404 ? 'not_found' : 'bad_request', message, null, null);
}

/** The function's calendar answer: the day and its rows as an outsider sees them, and the form's choices. */
export async function day(key: LinkKey, picked: string | null): Promise<PublicDayAnswer> {
  await delay();
  jobFor(key);
  const ctx = await formContext(key.projectId);
  const d = picked ?? ctx.today;
  if (d < ctx.today) throw refuse(400, 'Pick today or a later day.');
  const rows = (await calendar(key.projectId, d, d))
    .filter((r) => r.is_block || !['gc_review', 'returned'].includes(r.status))
    .map((r) => ({ start_time: r.start_time, duration_kind: r.duration_kind, duration_min: r.duration_min, kind: r.kind, status_key: r.status_key }));
  return { today: ctx.today, day: d, ofs: ctx.ofs, kinds: ctx.kinds, rows };
}

function facts(projectId: string, r: IrRowRaw | IrRequest, special: string | null): RequestFacts {
  return {
    project_name: MOCK_PROJECTS.find((p) => p.project_id === projectId)?.name ?? '',
    number: r.number, request_date: r.request_date, start_time: r.start_time, duration_kind: r.duration_kind,
    duration_min: r.duration_min, kind: r.kind, special_kind: special, status: r.status, result: r.result,
    result_note: r.result_note, gc_step: false,
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
    },
    { name: v.contact.name.trim(), phone: v.contact.phone.trim(), email: v.contact.email.trim() },
  );
  const receipt = newReceipt();
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...receipts(), [receipt]: row.id }));
  const special = (await formContext(key.projectId)).kinds.find((k) => k.id === row.special_kind_id)?.name ?? null;
  return { ...facts(key.projectId, row, special), receipt };
}

export async function status(projectId: string, receipt: string): Promise<RequestFacts> {
  await delay();
  const id = receipts()[receipt];
  const row = id === undefined ? null : await request(id);
  if (!row || row.project_id !== projectId) throw refuse(404, GONE);
  return facts(projectId, row, row.ir_special_kinds?.name ?? null);
}
