// Changing a company's setup of a daily form (SPEC §18.1 principle 10): tick, rename, move up or down, take one of the
// company's own fields off and put it back. Pure: the whole setup in (lib/dailies fullSetup), the next one out. A key
// never changes here, and none is made here: the database gives the company's own fields their keys.
import type { FormSetup } from '../../lib/dailies';

type Field = FormSetup['fields'][number];
type Table = FormSetup['tables'][number];
type Column = Table['columns'][number];

/** Which list of the setup: the daily fields, the tables, or one table's columns. */
export type SetupList = { list: 'fields' } | { list: 'tables' } | { list: 'columns'; table: string };

interface Entry {
  key: string;
  on: boolean;
  label: string | null;
}

function patched<E extends Entry>(list: readonly E[], key: string, patch: Partial<Entry>): E[] {
  return list.map((e) => (e.key === key ? { ...e, ...patch } : e));
}

function inTable(setup: FormSetup, table: string, change: (columns: readonly Column[]) => Column[]): FormSetup {
  return { ...setup, tables: setup.tables.map((t) => (t.key === table ? { ...t, columns: change(t.columns) } : t)) };
}

function patch(setup: FormSetup, where: SetupList, key: string, change: Partial<Entry>): FormSetup {
  if (where.list === 'fields') return { ...setup, fields: patched(setup.fields, key, change) };
  if (where.list === 'tables') return { ...setup, tables: patched(setup.tables, key, change) };
  return inTable(setup, where.table, (columns) => patched(columns, key, change));
}

/** Ticks a field, table or column on or off. */
export function setOn(setup: FormSetup, where: SetupList, key: string, on: boolean): FormSetup {
  return patch(setup, where, key, { on });
}

/** Renames one: the company's name for it, or null for ours. */
export function rename(setup: FormSetup, where: SetupList, key: string, label: string | null): FormSetup {
  return patch(setup, where, key, { label });
}

/** The list with `key` moved one place among its peers, or null when there is nowhere to go. */
function moved<E extends Entry>(list: readonly E[], key: string, by: -1 | 1, peer: (a: E, b: E) => boolean): E[] | null {
  const i = list.findIndex((e) => e.key === key);
  const from = list[i];
  if (from === undefined) return null;
  let j = i + by;
  let to = list[j];
  while (to !== undefined && !peer(from, to)) {
    j += by;
    to = list[j];
  }
  if (to === undefined) return null;
  const out = [...list];
  out[i] = to;
  out[j] = from;
  return out;
}

function anyPeer(): boolean {
  return true;
}

/**
 * Moves one up (-1) or down (1), or null when it is already first or last. A short field moves among the short ones
 * and a long one among the long ones, the way the report shows them (short fields, tables, long fields).
 */
export function move(setup: FormSetup, where: SetupList, key: string, by: -1 | 1): FormSetup | null {
  if (where.list === 'fields') {
    const fields = moved(setup.fields, key, by, (a, b) => a.long === b.long);
    return fields === null ? null : { ...setup, fields };
  }
  if (where.list === 'tables') {
    const tables = moved(setup.tables, key, by, anyPeer);
    return tables === null ? null : { ...setup, tables };
  }
  const columns = moved(setup.tables.find((t) => t.key === where.table)?.columns ?? [], key, by, anyPeer);
  return columns === null ? null : inTable(setup, where.table, () => columns);
}

/** One of the company's own fields or columns as it was, to put back (Undo). */
type TakenOff =
  | { list: 'fields'; index: number; entry: Field }
  | { list: 'columns'; table: string; index: number; entry: Column };

/** Finds one of the company's own fields or columns, to take it off. Null: it is not there. */
export function taken(setup: FormSetup, where: SetupList, key: string): TakenOff | null {
  if (where.list === 'fields') {
    const index = setup.fields.findIndex((f) => f.key === key);
    const entry = setup.fields[index];
    return entry === undefined ? null : { list: 'fields', index, entry };
  }
  if (where.list === 'tables') return null;
  const columns = setup.tables.find((t) => t.key === where.table)?.columns ?? [];
  const index = columns.findIndex((c) => c.key === key);
  const entry = columns[index];
  return entry === undefined ? null : { list: 'columns', table: where.table, index, entry };
}

/** The setup without it. */
export function takeOff(setup: FormSetup, gone: TakenOff): FormSetup {
  if (gone.list === 'fields') return { ...setup, fields: setup.fields.filter((f) => f.key !== gone.entry.key) };
  return inTable(setup, gone.table, (columns) => columns.filter((c) => c.key !== gone.entry.key));
}

function putIn<E extends Entry>(list: readonly E[], index: number, entry: E): E[] {
  if (list.some((e) => e.key === entry.key)) return [...list];
  return [...list.slice(0, index), entry, ...list.slice(index)];
}

/** Puts it back where it was, under its own key. */
export function putBack(setup: FormSetup, gone: TakenOff): FormSetup {
  if (gone.list === 'fields') return { ...setup, fields: putIn(setup.fields, gone.index, gone.entry) };
  return inTable(setup, gone.table, (columns) => putIn(columns, gone.index, gone.entry));
}

/**
 * The setup on screen with the field or column the database just added (the last of its list in what was saved), and
 * the saved key counter. What was changed on screen while the add was on its way stays.
 */
export function withAdded(current: FormSetup, saved: FormSetup, table: string | null): FormSetup {
  const seq = saved.seq;
  if (table === null) {
    const entry = saved.fields.at(-1);
    return entry === undefined ? { ...current, seq } : { ...current, seq, fields: putIn(current.fields, current.fields.length, entry) };
  }
  const entry = saved.tables.find((t) => t.key === table)?.columns.at(-1);
  return entry === undefined ? { ...current, seq } : inTable({ ...current, seq }, table, (columns) => putIn(columns, columns.length, entry));
}
