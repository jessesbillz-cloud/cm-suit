// Mock bid forms: a synthetic copy of the default templates (migration 0034), picked by the mock job's prevailing
// wage and DSA flags the way open_bid_forms does, added on the job's first open. Changes live in sessionStorage.
import type { BidFormItem, BidForms, FormPatch, FormTiming } from '../bidForms';
import { conflictError, DataError } from '../errors';
import * as api from './api';
import { mockUser } from './index';
import * as mockJobs from './jobs';
import { delay } from './store';

const KEY = 'e2e-mock-bidforms';

interface Template {
  id: string;
  name: string;
  reference: string;
  timing: FormTiming;
  pw: boolean | null;
  dsa: boolean | null;
  sort: number;
}

const TEMPLATES: Template[] = [
  { id: 'tpl-bid-form', name: 'Bid form', reference: "Owner's bid documents", timing: 'with_bid', pw: null, dsa: null, sort: 10 },
  { id: 'tpl-bid-bond', name: 'Bid bond', reference: 'PCC §20111(b) schools; §10167 state (10%)', timing: 'with_bid', pw: true, dsa: null, sort: 20 },
  { id: 'tpl-subs', name: 'Subcontractor list', reference: 'PCC §4104', timing: 'with_bid', pw: true, dsa: null, sort: 30 },
  { id: 'tpl-noncollusion', name: 'Noncollusion declaration', reference: 'PCC §7106', timing: 'with_bid', pw: true, dsa: null, sort: 40 },
  { id: 'tpl-dir', name: 'DIR registration', reference: 'Labor Code §1725.5, §1771.1', timing: 'with_bid', pw: true, dsa: null, sort: 50 },
  { id: 'tpl-cslb', name: 'CSLB license', reference: 'B&P Code §7028.15, §7030.5', timing: 'with_bid', pw: null, dsa: null, sort: 60 },
  { id: 'tpl-iran', name: 'Iran Contracting Act', reference: 'PCC §2204 (bids of $1M or more)', timing: 'with_bid', pw: true, dsa: null, sort: 70 },
  { id: 'tpl-addenda', name: 'Addenda acknowledged', reference: "Owner's bid documents", timing: 'with_bid', pw: null, dsa: null, sort: 80 },
  { id: 'tpl-prequal', name: 'Prequalification', reference: 'PCC §20111.6 (schools, $1M+, state bonds)', timing: 'with_bid', pw: null, dsa: true, sort: 90 },
  { id: 'tpl-payment', name: 'Payment bond', reference: 'Civil Code §9550, §9554 (100%)', timing: 'after_award', pw: true, dsa: null, sort: 110 },
  { id: 'tpl-performance', name: 'Performance bond', reference: "Owner's contract; PCC §10221 (state)", timing: 'after_award', pw: true, dsa: null, sort: 120 },
  { id: 'tpl-comp', name: "Workers' comp certification", reference: 'Labor Code §1861', timing: 'after_award', pw: true, dsa: null, sort: 130 },
  { id: 'tpl-insurance', name: 'Insurance certificates', reference: "Owner's contract", timing: 'after_award', pw: null, dsa: null, sort: 140 },
  { id: 'tpl-background', name: 'Background check certificate', reference: 'Education Code §45125.2', timing: 'after_award', pw: null, dsa: true, sort: 150 },
  { id: 'tpl-contract', name: 'Contract', reference: "Owner's contract", timing: 'after_award', pw: null, dsa: null, sort: 160 },
];

/** A stored row: the item without its file (resolved on read) and whether it was removed. */
interface Stored {
  item: Omit<BidFormItem, 'file'>;
  deleted: boolean;
}

function readAll(): Stored[] {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? [] : (JSON.parse(raw) as Stored[]);
}

function writeAll(rows: Stored[]): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(rows));
}

async function withFile(item: Stored['item']): Promise<BidFormItem> {
  const f = item.file_id === null ? null : await api.file(item.file_id);
  return { ...item, file: f ? { id: f.id, original_name: f.original_name, size: f.size } : null };
}

export async function open(projectId: string): Promise<BidForms> {
  await delay();
  if (mockUser().id === 'mock-user-bidder') throw new DataError("You don't have access to that.", '42501', 'mock: not a bids manager');
  const job = await mockJobs.project(projectId);
  const rows = readAll();
  const have = new Set(rows.filter((r) => r.item.project_id === projectId).map((r) => r.item.template_id));
  const added: Stored[] = TEMPLATES.filter(
    (t) => !have.has(t.id) && (t.pw === null || t.pw === job.prevailing_wage) && (t.dsa === null || t.dsa === job.is_dsa),
  ).map((t) => ({
    item: {
      id: `${projectId}-${t.id}`,
      project_id: projectId,
      template_id: t.id,
      name: t.name,
      reference: t.reference,
      timing: t.timing,
      required: true,
      status: 'to_do',
      file_id: null,
      due_on: null,
      note: '',
      sort: t.sort,
      version: 1,
    },
    deleted: false,
  }));
  if (added.length > 0) writeAll([...rows, ...added]);
  const live = [...rows, ...added]
    .filter((r) => r.item.project_id === projectId && !r.deleted)
    .map((r) => r.item)
    .sort((a, b) => a.sort - b.sort);
  return { folderId: `${projectId}-bid-forms`, items: await Promise.all(live.map(withFile)) };
}

export async function save(row: BidFormItem, patch: FormPatch): Promise<BidFormItem> {
  await delay();
  const rows = readAll();
  const current = rows.find((r) => r.item.id === row.id);
  if (!current || current.item.version !== row.version) throw conflictError();
  const { removed, ...rest } = patch;
  const next: Stored = {
    item: { ...current.item, ...rest, version: current.item.version + 1 },
    deleted: removed ?? current.deleted,
  };
  writeAll(rows.map((r) => (r.item.id === row.id ? next : r)));
  return withFile(next.item);
}

export async function add(projectId: string, name: string, timing: FormTiming): Promise<BidFormItem> {
  await delay();
  const rows = readAll();
  const item: Stored['item'] = {
    id: `mock-form-${String(rows.length + 1)}`,
    project_id: projectId,
    template_id: null,
    name,
    reference: '',
    timing,
    required: true,
    status: 'to_do',
    file_id: null,
    due_on: null,
    note: '',
    sort: 1000,
    version: 1,
  };
  writeAll([...rows, { item, deleted: false }]);
  return withFile(item);
}
