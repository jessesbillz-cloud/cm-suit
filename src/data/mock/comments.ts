// e2e mock of comments (migration 0050): the same rules as the database. Anyone but a bidder writes; only the author
// edits, version-checked, and the earlier text is kept; a repeat of the same send adds nothing; nothing deletes.
// State lives in sessionStorage, never module state. Seeded with two synthetic comments on Sample Job A's RFI 002.
import type { CommentList, CommentTarget } from '../comments.types';
import { COMMENT_MAX } from '../comments.types';
import { DataError, conflictError } from '../errors';
import { SEED_RFI_ID } from './boardSeeds';
import { MOCK_PEOPLE } from './fixtures';
import { mockUser } from './index';
import { delay } from './store';

const KEY = 'e2e-mock-comments';
const DAY = 86_400_000;

interface StoredComment {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  version: number;
  request_key: string | null;
  earlier: { body: string; written_at: string }[];
}

interface CommentMockState {
  comments: StoredComment[];
  next: number;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function seed(now: number): CommentMockState {
  const on = { project_id: 'job-a', entity_type: 'rfi', entity_id: SEED_RFI_ID, request_key: null };
  return {
    comments: [
      {
        ...on,
        id: 'mock-comment-1',
        author_id: 'mock-someone',
        body: 'Sample: confirm the clip type with the storefront supplier before re-anchoring.',
        created_at: iso(now - 2 * DAY),
        edited_at: iso(now - 2 * DAY + 3_600_000),
        version: 2,
        earlier: [{ body: 'Sample: confirm the clip type first.', written_at: iso(now - 2 * DAY) }],
      },
      {
        ...on,
        id: 'mock-comment-2',
        author_id: 'mock-user-sub',
        body: 'Sample: the framing crew can re-anchor on Thursday if the clips arrive Wednesday.',
        created_at: iso(now - DAY),
        edited_at: null,
        version: 1,
        earlier: [],
      },
    ],
    next: 3,
  };
}

function read(): CommentMockState {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? seed(Date.now()) : (JSON.parse(raw) as CommentMockState);
}

function write(update: (s: CommentMockState) => CommentMockState): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(update(read())));
}

function who(userId: string): { name: string; company: string } {
  const person = MOCK_PEOPLE.find((p) => p.user_id === userId);
  if (person) return { name: person.full_name, company: person.company };
  const word = userId.replace(/^mock-user-/, '');
  return { name: `Sample ${word.charAt(0).toUpperCase()}${word.slice(1)}`, company: 'Sample Design' };
}

function onItem(c: StoredComment, t: CommentTarget): boolean {
  return c.project_id === t.projectId && c.entity_type === t.entityType && c.entity_id === t.entityId;
}

function checkBody(body: string): string {
  const v = body.trim();
  if (v === '') throw new DataError('Write a comment.', '22023', null);
  if (v.length > COMMENT_MAX) throw new DataError('Keep a comment to 4000 characters.', '22023', null);
  return v;
}

export async function list(t: CommentTarget): Promise<CommentList> {
  await delay();
  const me = mockUser().id;
  return {
    can_write: me !== 'mock-user-bidder',
    comments: read()
      .comments.filter((c) => onItem(c, t))
      .map((c) => {
        const author = who(c.author_id);
        return {
          id: c.id,
          version: c.version,
          body: c.body,
          created_at: c.created_at,
          edited_at: c.edited_at,
          author_id: c.author_id,
          author_name: author.name,
          author_company: author.company,
          mine: c.author_id === me,
          earlier: c.earlier,
        };
      }),
  };
}

export async function add(t: CommentTarget, body: string, key: string): Promise<void> {
  await delay();
  const me = mockUser().id;
  if (me === 'mock-user-bidder') throw new DataError("You don't have access to that.", '42501', null);
  const s = read();
  if (s.comments.some((c) => c.author_id === me && c.request_key === key)) return;
  const v = checkBody(body);
  write((x) => ({
    next: x.next + 1,
    comments: [
      ...x.comments,
      {
        id: `mock-comment-${String(x.next)}`,
        project_id: t.projectId,
        entity_type: t.entityType,
        entity_id: t.entityId,
        author_id: me,
        body: v,
        created_at: iso(Date.now()),
        edited_at: null,
        version: 1,
        request_key: key,
        earlier: [],
      },
    ],
  }));
}

export async function edit(id: string, version: number, body: string): Promise<void> {
  await delay();
  const c = read().comments.find((x) => x.id === id);
  if (!c) throw new DataError('That item no longer exists.', 'P0002', null);
  if (c.author_id !== mockUser().id) throw new DataError("You don't have access to that.", '42501', null);
  const v = checkBody(body);
  if (c.body === v) return;
  if (c.version !== version) throw conflictError();
  write((x) => ({
    ...x,
    comments: x.comments.map((y) =>
      y.id === id
        ? {
            ...y,
            body: v,
            edited_at: iso(Date.now()),
            version: y.version + 1,
            earlier: [...y.earlier, { body: y.body, written_at: y.edited_at ?? y.created_at }],
          }
        : y,
    ),
  }));
}
