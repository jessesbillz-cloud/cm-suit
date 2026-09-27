// Mock-only persistence. Lives in sessionStorage (not module state) so a Playwright page keeps its changes
// across route changes and reloads within one test, and nothing leaks between tests.
import type { LayoutChoices } from '../../lib/layout';
import type { FileRow, FolderRow, ProfileRow } from '../types';

const KEY = 'e2e-mock-state';

interface MockState {
  tasks: Record<string, { done: boolean; version: number }>;
  layout: { choices: LayoutChoices; version: number } | null;
  readMarks: Record<string, string>;
  folders: FolderRow[];
  files: FileRow[];
  profile: ProfileRow | null;
  revoked: string[];
}

const EMPTY: MockState = {
  tasks: {},
  layout: null,
  readMarks: {},
  folders: [],
  files: [],
  profile: null,
  revoked: [],
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
