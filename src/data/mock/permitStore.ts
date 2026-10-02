// The permits mock's state and its access rules, shared by mock/permits (permits, moves) and mock/permitReviews
// (reviews, comments, linked inspections): 'ahj' (the official) reads and manages, 'pm' and 'architect' read and answer
// comments, 'inspector' reads, everyone else sees nothing. State lives in sessionStorage, never module state.
import { DataError } from '../errors';
import { mockUser } from './index';
import { permitJobRows } from './permitJobs';
import { OFFICIAL, OFFICIAL_2, seedState, type PermitMockState, type StoredPermit } from './permitSeeds';

const KEY = 'e2e-mock-permits';

export function read(): PermitMockState {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? seedState(Date.now()) : (JSON.parse(raw) as PermitMockState);
}

export function write(update: (s: PermitMockState) => PermitMockState): PermitMockState {
  const next = update(read());
  window.sessionStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

const CAPS: Record<string, readonly string[]> = {
  ahj: ['permits.read', 'permits.manage'],
  pm: ['permits.read', 'permits.respond'],
  architect: ['permits.read', 'permits.respond'],
  inspector: ['permits.read'],
};

export function has(cap: string): boolean {
  return (CAPS[mockUser().id.replace(/^mock-user-/, '')] ?? []).includes(cap);
}

const NAMES: Record<string, string> = {
  [OFFICIAL]: 'Sample Deputy',
  [OFFICIAL_2]: 'Sample Deputy 2',
  'mock-user-architect': 'Sample Architect',
  'mock-user-pm': 'Sample PM',
};

export function nameOf(id: string | null): string | null {
  return id === null ? null : (NAMES[id] ?? 'Sample Member');
}

export function fail(message: string, code = '22023'): DataError {
  return new DataError(message, code, null);
}

export function readable(projectId: string): boolean {
  return has('permits.read') && permitJobRows().some((j) => j.id === projectId);
}

/** The permit, if I may read it. */
export function stored(s: PermitMockState, id: string): StoredPermit {
  const p = s.permits.find((x) => x.id === id);
  if (!p || !readable(p.project_id)) throw fail('That item no longer exists.', 'P0002');
  return p;
}

export function mustHave(cap: string): void {
  if (!has(cap)) throw fail("You don't have access to that.", '42501');
}
