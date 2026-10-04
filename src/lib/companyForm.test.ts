// A company's version of a built-in daily form (SPEC §18.1 principle 10): the one setup schema, the keys of the
// company's own fields, the one resolver, and the form a signed report keeps.
// supabase/functions/_shared/reportForms_test.ts runs the same rules in Deno.
import { describe, expect, it } from 'vitest';
import { companyForm } from '../../supabase/functions/_shared/reportForms';
import {
  FORM_CHOICES,
  FORM_SETUP_LIMITS,
  addedKey,
  companyForms,
  formOf,
  formSetupSchema,
  formSnapshot,
  fullSetup,
  isAddedKey,
  reportForm,
  tablesOf,
  type FormSetup,
  type ReportForm,
} from './dailies';

function form(id: string): ReportForm {
  const f = formOf(id);
  if (!f) throw new Error(`${id} is a form`);
  return f;
}

const GC = form('gc_daily');
const FOREMAN = form('foreman_daily');
const VIS = form('vis_daily');

/** The standard setup of the superintendent's daily with a change made to it. */
function gcSetup(change: (s: FormSetup) => void, seq = 0): FormSetup {
  const s = fullSetup(GC, null);
  s.seq = seq;
  change(s);
  return formSetupSchema.parse(s);
}

function field(s: FormSetup, key: string): FormSetup['fields'][number] {
  const f = s.fields.find((x) => x.key === key);
  if (!f) throw new Error(`no field ${key}`);
  return f;
}

function table(s: FormSetup, key: string): FormSetup['tables'][number] {
  const t = s.tables.find((x) => x.key === key);
  if (!t) throw new Error(`no table ${key}`);
  return t;
}

function valid(change: (s: FormSetup) => void, seq = 0): boolean {
  const s = fullSetup(GC, null);
  s.seq = seq;
  change(s);
  return formSetupSchema.safeParse(s).success;
}

function own(n: number): FormSetup['fields'] {
  return Array.from({ length: n }, (_, i) => ({ key: addedKey(i + 1), on: true, label: `Own ${String(i + 1)}`, long: false }));
}

describe("a company's version of a daily form", () => {
  it('no setup saved: the built-in form itself, unchanged; a fixed form ignores a setup', () => {
    for (const choice of FORM_CHOICES) {
      const f = formOf(choice.value);
      if (f) expect(companyForm(f, null)).toBe(f);
    }
    expect(companyForm(VIS, fullSetup(GC, null))).toBe(VIS);
    expect(companyForm(GC, fullSetup(GC, null))).toEqual(GC);
    expect(companyForm(FOREMAN, fullSetup(FOREMAN, null))).toEqual(FOREMAN);
    expect(companyForms({ report_generator: 'vis_daily' })).toEqual({});
    expect(companyForms(null)).toEqual({});
  });

  it("the company's own keys are x_<n>, a shape no built-in key has", () => {
    expect([1, 2, 10, 999999].every((n) => isAddedKey(addedKey(n)))).toBe(true);
    expect(['x_0', 'x_01', 'x_', 'x_1a', 'x1', 'x_1234567', 'notes'].some(isAddedKey)).toBe(false);
    for (const choice of FORM_CHOICES) {
      const f = formOf(choice.value);
      if (!f) continue;
      const keys = [...f.locked.map((x) => x.key), ...f.daily.map((x) => x.key), ...tablesOf(f).flatMap((t) => [t.key, ...t.columns.map((c) => c.key)])];
      expect(keys.some(isAddedKey)).toBe(false);
    }
  });

  it('renamed, hidden, reordered: keys stay, labels and order change', () => {
    const f = companyForm(
      GC,
      gcSetup((s) => {
        field(s, 'delays').label = '  Problems  ';
        field(s, 'low').on = false;
        table(s, 'visitors').on = false;
        table(s, 'manpower').label = 'Crew on site';
        for (const c of table(s, 'manpower').columns) {
          if (c.key === 'hours') c.label = 'Hrs';
          if (c.key === 'trade') c.on = false;
        }
        s.fields.reverse();
        s.tables.reverse();
      }),
    );
    expect(f.daily.map((x) => x.key)).toEqual(['notes', 'safety', 'delays', 'high', 'conditions']);
    expect(f.daily.find((x) => x.key === 'delays')?.label).toBe('Problems');
    expect(f.daily.find((x) => x.key === 'high')).toEqual(GC.daily.find((x) => x.key === 'high'));
    expect(tablesOf(f).map((t) => t.key)).toEqual(['inspections', 'deliveries', 'work', 'equipment', 'manpower']);
    const manpower = tablesOf(f).find((t) => t.key === 'manpower');
    expect(manpower).toMatchObject({ label: 'Crew on site', carry: true, source: 'signins' });
    expect(manpower?.columns.map((c) => [c.key, c.label])).toEqual([['company', 'Company'], ['count', 'Count'], ['hours', 'Hrs']]);
    expect(manpower?.columns.find((c) => c.key === 'hours')?.number).toBe(true);
    expect(f).toMatchObject({ shortTitle: 'Weather', safetyField: 'safety', standing: 'notes' });
    expect(GC.daily.map((x) => x.key)).toEqual(['conditions', 'high', 'low', 'delays', 'safety', 'notes']);
  });

  it('added fields and columns; the weather title and the safety field go with their fields', () => {
    const f = companyForm(
      GC,
      gcSetup((s) => {
        s.fields.push({ key: addedKey(1), on: true, label: 'Crew size', long: false }, { key: addedKey(2), on: true, label: 'Owner comments', long: true });
        table(s, 'manpower').columns.push({ key: addedKey(3), on: true, label: 'Foreman' });
        field(s, 'safety').on = false;
      }, 3),
    );
    expect(f.daily.find((x) => x.key === 'x_1')).toEqual({ key: 'x_1', label: 'Crew size', max: 120 });
    expect(f.daily.find((x) => x.key === 'x_2')).toEqual({ key: 'x_2', label: 'Owner comments', max: 20000, multiline: true });
    expect(tablesOf(f)[0]?.columns.at(-1)).toEqual({ key: 'x_3', label: 'Foreman', max: 120, w: 2 });
    expect('shortTitle' in f).toBe(false);
    expect('safetyField' in f).toBe(false);
  });

  it("a setup lists the company's form: what it does not list is off; unknown keys are ignored", () => {
    const partial = formSetupSchema.parse({
      fields: [{ key: 'notes', on: true }, { key: 'gone_field', on: true }],
      tables: [{ key: 'work', on: true, columns: [{ key: 'work', on: true }, { key: 'gone_col', on: true }] }],
    });
    const f = companyForm(GC, partial);
    expect(f.daily.map((x) => x.key)).toEqual(['notes']);
    expect(tablesOf(f).map((t) => [t.key, t.columns.map((c) => c.key)])).toEqual([['work', ['work']]]);
    const full = fullSetup(GC, partial);
    expect(full.fields.map((x) => [x.key, x.on])).toEqual([['notes', true], ['conditions', false], ['high', false], ['low', false], ['delays', false], ['safety', false]]);
    expect(table(full, 'work').columns.map((c) => [c.key, c.on])).toEqual([['work', true], ['company', false], ['area', false]]);
    expect(table(full, 'manpower').on).toBe(false);
  });

  it('the setup schema: names, counts, keys, and something left on', () => {
    expect(valid(() => undefined)).toBe(true);
    expect(formSetupSchema.parse({ fields: [{ key: 'notes', on: true }], tables: [] })).toEqual({
      seq: 0,
      fields: [{ key: 'notes', on: true, label: null, long: false }],
      tables: [],
    });
    expect(valid((s) => { field(s, 'notes').label = 'n'.repeat(FORM_SETUP_LIMITS.label + 1); })).toBe(false);
    expect(valid((s) => { field(s, 'notes').label = 'n'.repeat(FORM_SETUP_LIMITS.label); })).toBe(true);
    expect(valid((s) => { field(s, 'notes').label = '   '; })).toBe(false);
    expect(valid((s) => { field(s, 'notes').key = 'Notes'; })).toBe(false);
    expect(valid((s) => { s.fields.push({ ...field(s, 'notes') }); })).toBe(false);
    expect(valid((s) => { s.fields.push(...own(1)); })).toBe(false);
    expect(valid((s) => { s.fields.push(...own(1)); }, 1)).toBe(true);
    expect(valid((s) => { s.fields.push({ key: 'x_1', on: true, label: null, long: false }); }, 1)).toBe(false);
    expect(valid((s) => { s.tables.push({ key: 'x_1', on: true, label: 'Mine', columns: [{ key: 'x_2', on: true, label: 'A' }] }); }, 2)).toBe(false);
    expect(valid((s) => { s.fields.push(...own(FORM_SETUP_LIMITS.addedFields)); }, 50)).toBe(true);
    expect(valid((s) => { s.fields.push(...own(FORM_SETUP_LIMITS.addedFields + 1)); }, 50)).toBe(false);
    expect(valid((s) => { table(s, 'work').columns.push(...own(FORM_SETUP_LIMITS.addedColumns)); }, 50)).toBe(true);
    expect(valid((s) => { table(s, 'work').columns.push(...own(FORM_SETUP_LIMITS.addedColumns + 1)); }, 50)).toBe(false);
    expect(valid((s) => { for (const c of table(s, 'work').columns) c.on = false; })).toBe(false);
    expect(valid((s) => { for (const f of s.fields) f.on = false; for (const t of s.tables) t.on = false; })).toBe(false);
    expect(valid((s) => { for (const f of s.fields) f.on = false; for (const t of s.tables) t.on = t.key === 'work'; })).toBe(true);
  });

  it('stored forms are read by form id; one that cannot be read is our standard form', () => {
    const forms = companyForms({ daily_forms: { gc_daily: gcSetup((s) => { field(s, 'low').on = false; }), foreman_daily: { fields: 'broken' } } });
    expect(Object.keys(forms)).toEqual(['gc_daily']);
    expect(companyForm(GC, forms['gc_daily'] ?? null).daily.some((f) => f.key === 'low')).toBe(false);
    expect(companyForm(FOREMAN, forms['foreman_daily'] ?? null)).toBe(FOREMAN);
  });

  it('a signed report keeps the form it was signed on', () => {
    const signedOn = companyForm(
      GC,
      gcSetup((s) => {
        field(s, 'delays').label = 'Problems';
        field(s, 'low').on = false;
        s.fields.push({ key: addedKey(1), on: true, label: 'Crew size', long: false });
      }, 1),
    );
    const stored: unknown = JSON.parse(JSON.stringify(formSnapshot(signedOn)));
    expect(stored).toEqual(formSnapshot(signedOn));
    // The company changes its form afterwards.
    const now = gcSetup((s) => {
      field(s, 'delays').label = 'Issues today';
      field(s, 'notes').on = false;
    }, 1);
    expect(reportForm(GC, { status: 'submitted', form: stored }, now)).toEqual(signedOn);
    expect(reportForm(GC, { status: 'draft', form: null }, now)).toEqual(companyForm(GC, now));
    expect(reportForm(GC, { status: 'submitted', form: null }, now)).toBe(GC);
    expect(reportForm(GC, { status: 'submitted', form: { daily: 'x' } }, now)).toBeNull();
    expect(reportForm(VIS, { status: 'submitted', form: null }, now)).toBe(VIS);
  });
});
