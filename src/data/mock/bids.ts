// Tiny synthetic bid fixtures for the e2e mock: two packages on Sample Job A, one issued addendum, one answer.
// The mock bidder is localStorage['e2e-mock-user'] = 'bidder'; every other mock user manages bids.
import { DataError } from '../errors';
import type {
  AckRow,
  AddendumRow,
  BidderPage,
  CoverageRow,
  ExtractionRow,
  ExtractionSummary,
  InviteRow,
  PackageRow,
  PricingAccess,
  QuestionRow,
  ReadBidResult,
  ReceivedFile,
  SubmissionRow,
  SubName,
} from '../bids.types';
import { mockUser } from './index';
import * as mockCorrections from './corrections';
import * as mockLeveling from './leveling';
import * as mockMfa from './mfa';
import { delay, readMock, writeMock } from './store';
import * as api from './api';

const TZ = 'America/Los_Angeles';

function isBidder(): boolean {
  return mockUser().id === 'mock-user-bidder';
}

/** has_capability in the mock: the bidder can only submit; everyone else can do everything else. */
export async function capability(cap: string): Promise<boolean> {
  if (cap.startsWith('corrections.')) return mockCorrections.capability(cap);
  await delay();
  return isBidder() ? cap === 'bids.submit' : cap !== 'bids.submit';
}

/** The aal2-gated capabilities (pricing, findings): managers once the mock two-step login is done, never the bidder. */
export async function access(cap: string): Promise<PricingAccess> {
  if (!(await capability(cap))) return 'no';
  return mockMfa.pricingAccess(isBidder());
}

const PACKAGES: PackageRow[] = [
  { id: 'pkg-1', project_id: 'job-a', code: '03A', name: 'Sample concrete', scope_text: 'Footings and slabs per sample plans.', version: 1 },
  { id: 'pkg-2', project_id: 'job-a', code: '09A', name: 'Sample drywall', scope_text: 'Framing and board per sample plans.', version: 1 },
  // Sample Job B carries the leveling fixtures (mock/leveling).
  { id: 'pkg-b1', project_id: 'job-b', code: '03A', name: 'Sample concrete', scope_text: 'Footings and slabs per sample plans.', version: 1 },
  { id: 'pkg-b2', project_id: 'job-b', code: '09A', name: 'Sample drywall', scope_text: 'Framing and board per sample plans.', version: 1 },
];

export async function packages(projectId: string): Promise<PackageRow[]> {
  await delay();
  return PACKAGES.filter((p) => p.project_id === projectId);
}

export async function coverage(projectId: string): Promise<CoverageRow[]> {
  await delay();
  return PACKAGES.filter((p) => p.project_id === projectId).map((p, i) => ({
    package_id: p.id,
    code: p.code,
    name: p.name,
    invited: 3 - i,
    intends: 1,
    declined: i,
    submitted: 1 - i,
    late: 0,
    opened: 2 - i,
  }));
}

export async function invites(): Promise<InviteRow[]> {
  await delay();
  return [{ id: 'inv-1', package_id: 'pkg-1', member_id: 'member-2', status: 'intends', decline_reason: null }];
}

export async function questions(projectId: string): Promise<QuestionRow[]> {
  await delay();
  if (projectId !== 'job-a') return [];
  return [
    {
      id: 'q-1',
      project_id: 'job-a',
      package_id: 'pkg-1',
      number: 1,
      question: 'Is the sample slab thickness 4 or 6 inches?',
      status: 'open',
      created_at: '2026-09-22T17:00:00Z',
      version: 1,
    },
  ];
}

export async function addenda(projectId: string): Promise<AddendumRow[]> {
  await delay();
  if (projectId !== 'job-a') return [];
  return [
    { id: 'add-1', project_id: 'job-a', number: 1, title: 'Sample schedule change', body: 'Bid date moves one week.', file_ids: [], issued_at: '2026-09-23T17:00:00Z', version: 2 },
  ];
}

export async function acks(): Promise<AckRow[]> {
  await delay();
  return [];
}

export async function bidderPage(projectId: string): Promise<BidderPage> {
  await delay();
  if (!isBidder()) throw new DataError("You don't have access to that.", '42501', 'mock: not a bidder');
  const s = readMock().bidder;
  const pkgs = PACKAGES.filter((p) => p.project_id === projectId);
  return {
    project: { id: projectId, name: 'Sample Job A', number: 'S-100', address: '100 Sample Way', timezone: TZ, bid_due_at: '2026-10-15T21:00:00Z', prevailing_wage: true },
    upload_folder_id: `${projectId}-plans`,
    packages: pkgs.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      scope_text: p.scope_text,
      invite: { id: `inv-${p.id}`, status: s.intents[`inv-${p.id}`] ?? 'opened' },
      submissions: s.submissions.filter((x) => x.package_id === p.id).sort((a, b) => b.version_no - a.version_no),
    })),
    addenda: (await addenda(projectId)).map((a) => ({
      id: a.id,
      number: a.number,
      title: a.title,
      body: a.body,
      file_ids: a.file_ids,
      issued_at: a.issued_at ?? '',
      acked_at: s.acks[a.id] ?? null,
    })),
    answers: [{ number: 2, question_text: 'Is there a sample walk?', answer: 'Yes, see addendum 1.', published_at: '2026-09-23T18:00:00Z' }],
    my_questions: s.questions,
  };
}

export async function acknowledge(addendumId: string): Promise<void> {
  await delay();
  writeMock((m) => ({ ...m, bidder: { ...m.bidder, acks: { ...m.bidder.acks, [addendumId]: new Date().toISOString() } } }));
}

export async function setIntent(inviteId: string, intent: string): Promise<void> {
  await delay();
  writeMock((m) => ({ ...m, bidder: { ...m.bidder, intents: { ...m.bidder.intents, [inviteId]: intent } } }));
}

export async function submit(packageId: string, fileId: string): Promise<void> {
  await delay();
  writeMock((m) => {
    const mine = m.bidder.submissions.filter((x) => x.package_id === packageId);
    const row = {
      id: `sub-${String(m.bidder.submissions.length + 1)}`,
      package_id: packageId,
      receipt_number: m.bidder.submissions.length + 1,
      received_at: new Date().toISOString(),
      is_late: false,
      version_no: mine.length + 1,
      file_id: fileId,
      superseded: false,
    };
    const older = m.bidder.submissions.map((x) => (x.package_id === packageId ? { ...x, superseded: true } : x));
    return { ...m, bidder: { ...m.bidder, submissions: [...older, row] } };
  });
}

export async function ask(question: string): Promise<void> {
  await delay();
  writeMock((m) => {
    const n = m.bidder.questions.length + 10;
    const q = { id: `myq-${String(n)}`, number: n, question, status: 'open', created_at: new Date().toISOString() };
    return { ...m, bidder: { ...m.bidder, questions: [...m.bidder.questions, q] } };
  });
}

// ---------------------------------------------------------------------------
// Office intake (SPEC §11.6): received bids, reading them, the sub directory
// ---------------------------------------------------------------------------
const SUBS: SubName[] = [
  { id: 'sub-1', company: 'Sample Drywall Co' },
  { id: 'sub-2', company: 'Sample Concrete Inc' },
];

export async function subNames(): Promise<SubName[]> {
  await delay();
  return SUBS;
}

export async function submissions(projectId: string): Promise<SubmissionRow[]> {
  const fixed = await mockLeveling.submissions(projectId);
  return [...readMock().received.submissions.filter((s) => s.project_id === projectId).reverse(), ...fixed];
}

export async function extractions(projectId: string): Promise<ExtractionSummary[]> {
  await delay();
  return readMock()
    .received.extractions.filter((x) => x.project_id === projectId)
    .map((x) => ({ id: x.id, submission_id: x.submission_id, status: x.status, bidder_name: x.bidder_name }));
}

export async function extraction(submissionId: string): Promise<ExtractionRow | null> {
  await delay();
  return readMock().received.extractions.find((e) => e.submission_id === submissionId) ?? null;
}

export async function receivedFiles(folderId: string): Promise<ReceivedFile[]> {
  return (await api.files(folderId)).map((f) => ({
    id: f.id,
    original_name: f.original_name,
    size: f.size,
    text_status: 'pending',
    upload_complete: f.upload_complete,
  }));
}

/** record_received_bid: the same file gets the same receipt. */
export async function recordReceived(fileId: string, packageId: string): Promise<{ submissionId: string; receipt: number }> {
  await delay();
  const file = await api.file(fileId);
  if (!file) throw new DataError('That item no longer exists.', 'P0002', 'mock: file not found');
  const done = readMock().received.submissions.find((s) => s.file_id === fileId);
  if (done) return { submissionId: done.id, receipt: done.receipt_number };
  const next = readMock().received.submissions.length + 1;
  const row = {
    id: `recv-${String(next)}`,
    project_id: file.project_id,
    package_id: packageId,
    member_id: null,
    sub_id: null,
    file_id: fileId,
    receipt_number: next,
    received_at: new Date().toISOString(),
    is_late: false,
    version_no: 1,
  };
  writeMock((m) => ({ ...m, received: { ...m.received, submissions: [...m.received.submissions, row] } }));
  return { submissionId: row.id, receipt: next };
}

export async function setSub(submissionId: string, subId: string): Promise<void> {
  await delay();
  writeMock((m) => ({
    ...m,
    received: { ...m.received, submissions: m.received.submissions.map((s) => (s.id === submissionId ? { ...s, sub_id: subId } : s)) },
  }));
}

/** The bidder a synthetic file name stands for: its longest word group ("09_Sample Drywall_2026.pdf" -> "Sample Drywall"). */
function bidderFromName(name: string): string | null {
  const parts = name.replace(/\.[^.]+$/, '').split(/[_-]/).map((p) => p.trim()).filter((p) => /[a-z]/i.test(p));
  return parts.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** extract-bid in the mock: a draft whose bidder comes from the file name, so the sub link can be exercised. */
export async function extract(submissionId: string): Promise<ReadBidResult> {
  await delay();
  const sub = readMock().received.submissions.find((s) => s.id === submissionId);
  if (!sub) throw new DataError('That item no longer exists.', 'P0002', 'mock: submission not found');
  const file = await api.file(sub.file_id);
  const existing = readMock().received.extractions.find((x) => x.submission_id === submissionId);
  const row = {
    id: existing?.id ?? `ext-${submissionId}`,
    project_id: sub.project_id,
    submission_id: submissionId,
    status: 'draft',
    bidder_name: bidderFromName(file?.original_name ?? ''),
    bid_date: null,
    document_kind: 'proposal',
    prevailing_wage: 'not_stated',
    prevailing_wage_evidence: null,
    validity_days: null,
    scope_summary: 'Synthetic e2e findings.',
    inclusions: [],
    exclusions: [],
    notable_terms: [],
    project_match: 'unclear',
    confidence: 0.5,
    version: 1,
  };
  writeMock((m) => ({
    ...m,
    received: { ...m.received, extractions: [...m.received.extractions.filter((x) => x.submission_id !== submissionId), row] },
  }));
  return { extraction_id: row.id, findings: { bidder_name: row.bidder_name } };
}

/** Manager writes are not simulated: the mock covers the screens and the tap budgets, not every edit. */
export function notInMock(): never {
  throw new Error('Not available in the e2e mock.');
}
