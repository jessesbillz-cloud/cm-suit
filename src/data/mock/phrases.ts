// e2e mock of the quick phrases (0117), with the database's rules: each mock user's own, at most 50 live, a name of 40
// and a text of 500 characters, the known places only; an add with the same key is the same phrase, an edit or remove
// carries the version, a remove keeps the row and restore is its Undo. In sessionStorage (its own key). None seeded.
import { conflictError } from '../errors';
import { PHRASE_LIMITS, PHRASE_PLACES, type PhraseInput, type QuickPhrase } from '../phrases.types';
import { mockUser } from './index';
import { notFound, refuse } from './irRules';
import { delay } from './store';

const KEY = 'e2e-mock-phrases';

type Row = QuickPhrase & { owner: string; key: string };

function read(): Row[] {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? [] : (JSON.parse(raw) as Row[]);
}

function write(rows: Row[]): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(rows));
}

const live = (me: string) => read().filter((r) => r.owner === me && r.deleted_at === null);
const plain = (r: Row): QuickPhrase => ({
  id: r.id, version: r.version, context: r.context, label: r.label, body: r.body, sort: r.sort, deleted_at: r.deleted_at,
});

function check(v: PhraseInput): void {
  const body = v.body.trim();
  const label = v.label.trim();
  if (body.length < 1 || body.length > PHRASE_LIMITS.body) throw refuse('The text is 1 to 500 characters.');
  if (label.length < 1 || label.length > PHRASE_LIMITS.label) throw refuse('The name is 1 to 40 characters.');
  if (!PHRASE_PLACES.includes(v.context)) throw refuse('Unknown place for a quick button.');
}

function room(me: string): void {
  if (live(me).length >= PHRASE_LIMITS.count) throw refuse('You have 50 quick buttons. Remove one first.');
}

/** A row of mine, as the database finds it for a write. */
function mine(id: string): Row {
  const r = read().find((x) => x.id === id && x.owner === mockUser().id);
  if (!r) throw notFound();
  return r;
}

function save(next: Row): QuickPhrase {
  write(read().map((r) => (r.id === next.id ? next : r)));
  return plain(next);
}

export async function list(): Promise<QuickPhrase[]> {
  await delay();
  return live(mockUser().id).sort((a, b) => a.sort - b.sort).map(plain);
}

export async function add(v: PhraseInput & { key: string }): Promise<QuickPhrase> {
  await delay();
  const me = mockUser().id;
  const same = read().find((r) => r.owner === me && r.key === v.key);
  if (same) return plain(same);
  check(v);
  room(me);
  const row: Row = {
    id: `mock-phrase-${String(read().length + 1)}`, version: 1, context: v.context, label: v.label.trim(), body: v.body.trim(),
    sort: Math.max(-1, ...live(me).map((r) => r.sort)) + 1, deleted_at: null, owner: me, key: v.key,
  };
  write([...read(), row]);
  return plain(row);
}

export async function edit(phrase: QuickPhrase, v: PhraseInput): Promise<QuickPhrase> {
  await delay();
  const r = mine(phrase.id);
  if (r.deleted_at !== null) throw notFound();
  check(v);
  if (r.label === v.label.trim() && r.body === v.body.trim() && r.context === v.context) return plain(r);
  if (r.version !== phrase.version) throw conflictError();
  return save({ ...r, label: v.label.trim(), body: v.body.trim(), context: v.context, version: r.version + 1 });
}

export async function remove(phrase: QuickPhrase): Promise<QuickPhrase> {
  await delay();
  const r = mine(phrase.id);
  if (r.deleted_at !== null) return plain(r);
  if (r.version !== phrase.version) throw conflictError();
  return save({ ...r, deleted_at: new Date().toISOString(), version: r.version + 1 });
}

export async function restore(id: string): Promise<QuickPhrase> {
  await delay();
  const r = mine(id);
  if (r.deleted_at === null) return plain(r);
  room(r.owner);
  return save({ ...r, deleted_at: null, version: r.version + 1 });
}

export async function order(ids: string[]): Promise<QuickPhrase[]> {
  await delay();
  const me = mockUser().id;
  const rows = live(me);
  if (ids.length === 0 || new Set(ids).size !== ids.length || ids.some((id) => !rows.some((r) => r.id === id))) {
    throw refuse('Those are not your quick buttons.');
  }
  const rank = (r: Row) => (ids.includes(r.id) ? ids.indexOf(r.id) : ids.length + r.sort);
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
  write(read().map((r) => {
    const pos = sorted.findIndex((x) => x.id === r.id);
    return pos < 0 || r.sort === pos ? r : { ...r, sort: pos, version: r.version + 1 };
  }));
  return list();
}
