// Tiny synthetic bid fixtures for the e2e mock: two packages on Sample Job A, one issued addendum, one answer.
// The mock bidder is localStorage['e2e-mock-user'] = 'bidder'; every other mock user manages bids.
import { DataError } from '../errors';
import type { AckRow, AddendumRow, BidderPage, CoverageRow, InviteRow, PackageRow, PricingAccess, QuestionRow } from '../bids.types';
import { mockUser } from './index';
import * as mockMfa from './mfa';
import { delay, readMock, writeMock } from './store';

const TZ = 'America/Los_Angeles';

function isBidder(): boolean {
  return mockUser().id === 'mock-user-bidder';
}

/** has_capability in the mock: the bidder can only submit; everyone else can do everything else. */
export async function capability(cap: string): Promise<boolean> {
  await delay();
  return isBidder() ? cap === 'bids.submit' : cap !== 'bids.submit';
}

/** Money in the mock needs the mock two-step login (mock/mfa), like the real aal2 gate. */
export async function pricingAccess(): Promise<PricingAccess> {
  await delay();
  return mockMfa.pricingAccess(isBidder());
}

const PACKAGES: PackageRow[] = [
  { id: 'pkg-1', project_id: 'job-a', code: '03A', name: 'Sample concrete', scope_text: 'Footings and slabs per sample plans.', version: 1 },
  { id: 'pkg-2', project_id: 'job-a', code: '09A', name: 'Sample drywall', scope_text: 'Framing and board per sample plans.', version: 1 },
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

/** Manager writes are not simulated: the mock covers the screens and the tap budgets, not every edit. */
export function notInMock(): never {
  throw new Error('Not available in the e2e mock.');
}
