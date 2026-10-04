// Mock-only persistence. Lives in sessionStorage (not module state) so a Playwright page keeps its changes
// across route changes and reloads within one test, and nothing leaks between tests.
import type { LayoutChoices } from '../../lib/layout';
import type { BidderPage, BidderSubmission, ExtractionRow, PackageRow, SubmissionRow } from '../bids.types';
import type { FileRow, FolderRow, MyOrg, ProfileRow, ProjectRow } from '../types';

/** What the mock bidder changed on their page. */
interface MockBidderState {
  acks: Record<string, string>;
  intents: Record<string, string>;
  submissions: (BidderSubmission & { package_id: string })[];
  questions: BidderPage['my_questions'];
}

/** The mock authenticator: one factor at most, verified or not, and the session's level. */
interface MockMfa {
  factorId: string | null;
  verified: boolean;
  level: 'aal1' | 'aal2';
}

/** Bids the mock office recorded (SPEC §11.6 intake) and what reading them produced. */
interface MockReceivedState {
  submissions: (SubmissionRow & { project_id: string })[];
  extractions: (ExtractionRow & { project_id: string })[];
}

const KEY = 'e2e-mock-state';

interface MockState {
  tasks: Record<string, { done: boolean; version: number }>;
  layout: { choices: LayoutChoices; version: number } | null;
  readMarks: Record<string, string>;
  folders: FolderRow[];
  files: FileRow[];
  /** Ids of unfinished uploads their uploader removed (remove_unfinished_upload): the rows stay, hidden from every read. */
  removedUploads: string[];
  profile: ProfileRow | null;
  revoked: string[];
  bidder: MockBidderState;
  received: MockReceivedState;
  /** Companies and jobs made in this test, and edits to the fixture ones (by id). */
  orgs: MyOrg[];
  projects: ProjectRow[];
  mfa: MockMfa;
  /** Bid packages added in this test, and edits to the fixture ones (by id). */
  packages: PackageRow[];
}

const EMPTY: MockState = {
  tasks: {},
  layout: null,
  readMarks: {},
  folders: [],
  files: [],
  removedUploads: [],
  profile: null,
  revoked: [],
  bidder: { acks: {}, intents: {}, submissions: [], questions: [] },
  received: { submissions: [], extractions: [] },
  orgs: [],
  projects: [],
  mfa: { factorId: null, verified: false, level: 'aal1' },
  packages: [],
};

export function readMock(): MockState {
  const raw = window.sessionStorage.getItem(KEY);
  if (raw === null) return { ...EMPTY };
  return { ...EMPTY, ...(JSON.parse(raw) as Partial<MockState>) };
}

export function writeMock(update: (s: MockState) => MockState): MockState {
  const next = update(readMock());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** Simulated latency so loading states render in e2e like they do for real. */
export function delay(ms = 60): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
