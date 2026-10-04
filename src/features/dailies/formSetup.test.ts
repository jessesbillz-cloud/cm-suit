import { describe, expect, it } from 'vitest';
import { formOf, formSetupSchema, fullSetup, type FormSetup } from '../../lib/dailies';
import { move, putBack, rename, setOn, takeOff, taken, withAdded } from './formSetup';

function standard(): FormSetup {
  const form = formOf('gc_daily');
  if (!form) throw new Error('gc_daily is a form');
  return fullSetup(form, null);
}

function fieldKeys(s: FormSetup | null): string[] {
  return (s?.fields ?? []).map((f) => f.key);
}

function columnKeys(s: FormSetup | null, table: string): string[] {
  return (s?.tables.find((t) => t.key === table)?.columns ?? []).map((c) => c.key);
}

const MANPOWER = { list: 'columns', table: 'manpower' } as const;

describe("changing a company's form setup", () => {
  it('ticks and renames one entry of one list, keys untouched', () => {
    const s = standard();
    const off = setOn(s, { list: 'fields' }, 'low', false);
    expect(off.fields.find((f) => f.key === 'low')).toEqual({ key: 'low', on: false, label: null, long: false });
    expect(off.fields.filter((f) => f.key !== 'low')).toEqual(s.fields.filter((f) => f.key !== 'low'));
    const named = rename(rename(s, { list: 'tables' }, 'manpower', 'Crews'), MANPOWER, 'hours', 'Hrs');
    expect(named.tables.find((t) => t.key === 'manpower')).toMatchObject({ key: 'manpower', label: 'Crews' });
    expect(named.tables.find((t) => t.key === 'manpower')?.columns.find((c) => c.key === 'hours')?.label).toBe('Hrs');
    expect(named.tables.find((t) => t.key === 'equipment')?.columns.find((c) => c.key === 'hours')?.label).toBeNull();
    expect(rename(named, { list: 'tables' }, 'manpower', null).tables[0]?.label).toBeNull();
    expect(s).toEqual(standard());
  });

  it('moves a short field among the short ones and a long one among the long ones', () => {
    const s = standard();
    expect(fieldKeys(s)).toEqual(['conditions', 'high', 'low', 'delays', 'safety', 'notes']);
    expect(fieldKeys(move(s, { list: 'fields' }, 'low', -1))).toEqual(['conditions', 'low', 'high', 'delays', 'safety', 'notes']);
    expect(fieldKeys(move(s, { list: 'fields' }, 'notes', -1))).toEqual(['conditions', 'high', 'low', 'delays', 'notes', 'safety']);
    expect(move(s, { list: 'fields' }, 'conditions', -1)).toBeNull();
    expect(move(s, { list: 'fields' }, 'low', 1)).toBeNull();
    expect(move(s, { list: 'fields' }, 'delays', -1)).toBeNull();
    expect(move(s, { list: 'fields' }, 'notes', 1)).toBeNull();
    expect(move(s, { list: 'fields' }, 'no_such', 1)).toBeNull();
    // A long field of the company's own listed between the short ones still moves among the long ones.
    const mixed = { ...s, seq: 1, fields: [s.fields[0], { key: 'x_1', on: true, label: 'Own', long: true }, ...s.fields.slice(1)].filter((f) => f !== undefined) };
    expect(fieldKeys(move(mixed, { list: 'fields' }, 'x_1', 1))).toEqual(['conditions', 'delays', 'high', 'low', 'x_1', 'safety', 'notes']);
    expect(move(mixed, { list: 'fields' }, 'x_1', -1)).toBeNull();
  });

  it('moves tables and columns', () => {
    const s = standard();
    expect(move(s, { list: 'tables' }, 'equipment', -1)?.tables.map((t) => t.key).slice(0, 2)).toEqual(['equipment', 'manpower']);
    expect(move(s, { list: 'tables' }, 'manpower', -1)).toBeNull();
    expect(columnKeys(move(s, MANPOWER, 'trade', -1), 'manpower')).toEqual(['trade', 'company', 'count', 'hours']);
    expect(columnKeys(move(s, MANPOWER, 'trade', -1), 'equipment')).toEqual(['equipment', 'company', 'hours']);
    expect(move(s, MANPOWER, 'hours', 1)).toBeNull();
    expect(move(s, { list: 'columns', table: 'no_such' }, 'hours', 1)).toBeNull();
  });

  it("takes one of the company's own off and puts it back where it was (Undo)", () => {
    const s = standard();
    const withOwn: FormSetup = {
      ...s,
      seq: 2,
      fields: [...s.fields.slice(0, 2), { key: 'x_1', on: true, label: 'Crew size', long: false }, ...s.fields.slice(2)],
      tables: s.tables.map((t) => (t.key === 'manpower' ? { ...t, columns: [...t.columns, { key: 'x_2', on: true, label: 'Foreman' }] } : t)),
    };
    const field = taken(withOwn, { list: 'fields' }, 'x_1');
    if (field === null) throw new Error('x_1 is there');
    const without = takeOff(withOwn, field);
    expect(fieldKeys(without)).toEqual(fieldKeys(s));
    expect(without.seq).toBe(2);
    expect(putBack(without, field)).toEqual(withOwn);
    expect(putBack(withOwn, field)).toEqual(withOwn);
    const column = taken(withOwn, MANPOWER, 'x_2');
    if (column === null) throw new Error('x_2 is there');
    expect(columnKeys(takeOff(withOwn, column), 'manpower')).toEqual(['company', 'trade', 'count', 'hours']);
    expect(putBack(takeOff(withOwn, column), column)).toEqual(withOwn);
    expect(taken(withOwn, { list: 'fields' }, 'no_such')).toBeNull();
    expect(taken(withOwn, { list: 'tables' }, 'manpower')).toBeNull();
    expect(formSetupSchema.safeParse(putBack(without, field)).success).toBe(true);
  });

  it('what the database added joins the setup on screen, with the saved key counter', () => {
    const s = standard();
    const onScreen = setOn(s, { list: 'fields' }, 'low', false);
    const savedField: FormSetup = { ...s, seq: 1, fields: [...s.fields, { key: 'x_1', on: true, label: 'Crew size', long: false }] };
    const next = withAdded(onScreen, savedField, null);
    expect(next.seq).toBe(1);
    expect(fieldKeys(next).at(-1)).toBe('x_1');
    expect(next.fields.find((f) => f.key === 'low')?.on).toBe(false);
    expect(withAdded(next, savedField, null)).toEqual(next);
    const savedColumn: FormSetup = {
      ...next,
      seq: 2,
      tables: next.tables.map((t) => (t.key === 'work' ? { ...t, columns: [...t.columns, { key: 'x_2', on: true, label: 'Lot' }] } : t)),
    };
    const both = withAdded(next, savedColumn, 'work');
    expect(columnKeys(both, 'work')).toEqual(['company', 'area', 'work', 'x_2']);
    expect(both.seq).toBe(2);
    expect(formSetupSchema.safeParse(both).success).toBe(true);
  });
});
