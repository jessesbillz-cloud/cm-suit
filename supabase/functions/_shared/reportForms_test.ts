// `deno test --config supabase/functions/deno.json supabase/functions/_shared/reportForms_test.ts` — a company's version
// of a built-in daily form (SPEC §18.1 principle 10): the ONE setup schema and its limits, the keys the company's own
// fields get, the ONE resolver (no setup = the built-in form itself), and the form a signed report keeps.
// src/lib/companyForm.test.ts runs the same rules in vitest.
import { canonicalJson } from './crypto.ts';
import {
  addedKey, companyForm, companyForms, FORM_SETUP_LIMITS, formSetupSchema, formSnapshot, type FormSetup, fullSetup, isAddedKey,
  REPORT_FORMS, type ReportForm, reportForm, tablesOf,
} from './reportForms.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function same(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

const GC: ReportForm = REPORT_FORMS.gc_daily;
const FOREMAN: ReportForm = REPORT_FORMS.foreman_daily;
const VIS: ReportForm = REPORT_FORMS.vis_daily;

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

Deno.test('added keys: x_<n>, a shape no built-in key has', () => {
  for (const n of [1, 2, 10, 999999]) check(isAddedKey(addedKey(n)), `x_${n} is an added key`);
  for (const k of ['x_0', 'x_01', 'x_', 'x_1a', 'x1', 'x_1234567', 'notes', 'ax_1']) check(!isAddedKey(k), `${k} is not an added key`);
  for (const form of Object.values(REPORT_FORMS) as ReportForm[]) {
    const keys = [
      ...form.locked.map((f) => f.key), ...form.daily.map((f) => f.key),
      ...tablesOf(form).flatMap((t) => [t.key, ...t.columns.map((c) => c.key)]),
    ];
    check(keys.every((k) => !isAddedKey(k)), `${form.name}: no built-in key looks like an added one`);
  }
});

Deno.test('no setup: the built-in form itself, unchanged; a fixed form ignores a setup', () => {
  for (const form of Object.values(REPORT_FORMS) as ReportForm[]) check(companyForm(form, null) === form, `${form.name} with no setup`);
  check(companyForm(VIS, fullSetup(GC, null)) === VIS, 'the VIS form is fixed');
  check(same(companyForm(GC, fullSetup(GC, null)), GC), 'the standard setup resolves to the built-in superintendent form');
  check(same(companyForm(FOREMAN, fullSetup(FOREMAN, null)), FOREMAN), 'the standard setup resolves to the built-in foreman form');
  check(same(companyForms({ report_generator: 'vis_daily' }), {}) && same(companyForms(null), {}), 'no daily_forms saved');
});

Deno.test('renamed, hidden, reordered: keys stay, labels and order change', () => {
  const setup = gcSetup((s) => {
    field(s, 'delays').label = '  Problems  ';
    field(s, 'low').on = false;
    table(s, 'visitors').on = false;
    table(s, 'manpower').label = 'Crew on site';
    const hours = table(s, 'manpower').columns.find((c) => c.key === 'hours');
    if (hours) hours.label = 'Hrs';
    const trade = table(s, 'manpower').columns.find((c) => c.key === 'trade');
    if (trade) trade.on = false;
    s.fields.reverse();
    s.tables.reverse();
  });
  const f = companyForm(GC, setup);
  check(same(f.daily.map((x) => x.key), ['notes', 'safety', 'delays', 'high', 'conditions']), `fields in the company's order, Low off (${f.daily.map((x) => x.key).join()})`);
  check(f.daily.find((x) => x.key === 'delays')?.label === 'Problems', 'a rename is a trimmed label');
  check(same(f.daily.find((x) => x.key === 'high'), GC.daily.find((x) => x.key === 'high')), 'an untouched field is the built-in one (unit, max)');
  check(same(tablesOf(f).map((t) => t.key), ['inspections', 'deliveries', 'work', 'equipment', 'manpower']), 'tables in the company\'s order, Visitors off');
  const manpower = tablesOf(f).find((t) => t.key === 'manpower');
  check(manpower?.label === 'Crew on site' && manpower.carry === true && manpower.source === 'signins', 'a renamed table keeps what it does');
  check(same(manpower?.columns.map((c) => [c.key, c.label]), [['company', 'Company'], ['count', 'Count'], ['hours', 'Hrs']]), 'Trade off, Hours renamed');
  check(manpower?.columns.find((c) => c.key === 'hours')?.number === true, 'a renamed number column is still a number');
  check(f.shortTitle === 'Weather' && f.safetyField === 'safety' && f.standing === 'notes', 'the weather title and safety field hold');
  check(same(GC.daily.map((x) => x.key), ['conditions', 'high', 'low', 'delays', 'safety', 'notes']), 'the built-in form is not touched');
});

Deno.test('added fields and columns; the weather title and the safety field go with their fields', () => {
  const setup = gcSetup((s) => {
    s.fields.push({ key: addedKey(1), on: true, label: 'Crew size', long: false }, { key: addedKey(2), on: true, label: 'Owner comments', long: true });
    table(s, 'manpower').columns.push({ key: addedKey(3), on: true, label: 'Foreman' });
    field(s, 'safety').on = false;
  }, 3);
  const f = companyForm(GC, setup);
  check(same(f.daily.find((x) => x.key === 'x_1'), { key: 'x_1', label: 'Crew size', max: 120 }), 'an added short field');
  check(same(f.daily.find((x) => x.key === 'x_2'), { key: 'x_2', label: 'Owner comments', max: 20000, multiline: true }), 'an added long field');
  check(same(tablesOf(f)[0]?.columns.at(-1), { key: 'x_3', label: 'Foreman', max: 120, w: 2 }), 'an added column');
  check(f.shortTitle === undefined && !('shortTitle' in f), 'a short field of the company\'s own: the title is no longer "Weather"');
  check(f.safetyField === undefined && !('safetyField' in f), 'Safety off: nothing fills it');
  const offAgain = companyForm(GC, gcSetup((s) => {
    s.fields.push({ key: addedKey(1), on: false, label: 'Crew size', long: false });
  }, 1));
  check(offAgain.shortTitle === 'Weather' && same(offAgain.daily, GC.daily), 'an added field turned off is not on the form');
});

Deno.test('a setup lists the company\'s form: what it does not list is off; unknown keys are ignored', () => {
  const partial = formSetupSchema.parse({
    fields: [{ key: 'notes', on: true }, { key: 'gone_field', on: true }],
    tables: [{ key: 'work', on: true, columns: [{ key: 'work', on: true }, { key: 'gone_col', on: true }] }, { key: 'gone_table', on: true, columns: [{ key: 'a', on: true }] }],
  });
  const f = companyForm(GC, partial);
  check(same(f.daily.map((x) => x.key), ['notes']), 'only the listed field');
  check(same(tablesOf(f).map((t) => [t.key, t.columns.map((c) => c.key)]), [['work', ['work']]]), 'only the listed table and column');
  const full = fullSetup(GC, partial);
  check(same(full.fields.map((x) => [x.key, x.on]), [['notes', true], ['conditions', false], ['high', false], ['low', false], ['delays', false], ['safety', false]]),
    'Setup shows the rest after, off');
  check(field(full, 'notes').long && !field(full, 'high').long, 'a built-in field is long or short as built');
  check(same(table(full, 'work').columns.map((c) => [c.key, c.on]), [['work', true], ['company', false], ['area', false]]), 'and the rest of a table\'s columns');
  check(table(full, 'manpower').on === false && table(full, 'manpower').columns.every((c) => c.on), 'a table not listed is off, its columns ready');
});

Deno.test('the setup schema: names, counts, keys, and something left on', () => {
  const ok = (change: (s: FormSetup) => void, seq = 0): boolean => {
    const s = fullSetup(GC, null);
    s.seq = seq;
    change(s);
    return formSetupSchema.safeParse(s).success;
  };
  check(ok(() => {}), 'the standard setup is valid');
  check(same(formSetupSchema.parse({ fields: [{ key: 'notes', on: true }], tables: [] }), { seq: 0, fields: [{ key: 'notes', on: true, label: null, long: false }], tables: [] }),
    'defaults: seq 0, our label, a short field');
  check(!ok((s) => { field(s, 'notes').label = 'n'.repeat(FORM_SETUP_LIMITS.label + 1); }), 'a name over the limit');
  check(ok((s) => { field(s, 'notes').label = 'n'.repeat(FORM_SETUP_LIMITS.label); }), 'a name at the limit');
  check(!ok((s) => { field(s, 'notes').label = '   '; }), 'a blank name');
  check(!ok((s) => { field(s, 'notes').key = 'Notes'; }), 'a bad key');
  check(!ok((s) => { s.fields.push({ ...field(s, 'notes') }); }), 'a field listed twice');
  check(!ok((s) => { table(s, 'work').columns.push({ key: 'work', on: true, label: null }); }), 'a column listed twice');
  check(!ok((s) => { s.fields.push({ key: 'x_1', on: true, label: 'Mine', long: false }); }), 'an added key the form never gave out');
  check(ok((s) => { s.fields.push({ key: 'x_1', on: true, label: 'Mine', long: false }); }, 1), 'an added key the form gave out');
  check(!ok((s) => { s.fields.push({ key: 'x_1', on: true, label: null, long: false }); }, 1), 'an added field needs a name');
  check(!ok((s) => { s.tables.push({ key: 'x_1', on: true, label: 'Mine', columns: [{ key: 'x_2', on: true, label: 'A' }] }); }, 2), 'a table cannot be added');
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ key: addedKey(i + 1), on: true, label: `Own ${i + 1}`, long: false }));
  check(ok((s) => { s.fields.push(...many(FORM_SETUP_LIMITS.addedFields)); }, 50), 'added fields at the limit');
  check(!ok((s) => { s.fields.push(...many(FORM_SETUP_LIMITS.addedFields + 1)); }, 50), 'added fields over the limit');
  check(ok((s) => { table(s, 'work').columns.push(...many(FORM_SETUP_LIMITS.addedColumns)); }, 50), 'added columns at the limit');
  check(!ok((s) => { table(s, 'work').columns.push(...many(FORM_SETUP_LIMITS.addedColumns + 1)); }, 50), 'added columns over the limit');
  check(!ok((s) => { for (const c of table(s, 'work').columns) c.on = false; }), 'a table left on with no column on');
  check(ok((s) => { table(s, 'work').on = false; for (const c of table(s, 'work').columns) c.on = false; }), 'a table off with its columns off');
  check(!ok((s) => { for (const f of s.fields) f.on = false; for (const t of s.tables) t.on = false; }), 'nothing left on');
  check(ok((s) => { for (const f of s.fields) f.on = false; for (const t of s.tables) t.on = t.key === 'work'; }), 'one table left on');
});

Deno.test('stored forms: read by form id; one that cannot be read is our standard form', () => {
  const stored = { daily_forms: { gc_daily: gcSetup((s) => { field(s, 'low').on = false; }), foreman_daily: { fields: 'broken' } } };
  const forms = companyForms(stored);
  check(same(Object.keys(forms), ['gc_daily']), 'the readable one');
  check(companyForm(GC, forms['gc_daily'] ?? null).daily.every((f) => f.key !== 'low'), 'and it is applied');
  check(companyForm(FOREMAN, forms['foreman_daily'] ?? null) === FOREMAN, 'the broken one reads as the standard form');
});

Deno.test('a signed report keeps the form it was signed on', () => {
  const then = gcSetup((s) => {
    field(s, 'delays').label = 'Problems';
    field(s, 'low').on = false;
    s.fields.push({ key: addedKey(1), on: true, label: 'Crew size', long: false });
  }, 1);
  const signedOn = companyForm(GC, then);
  const saved = formSnapshot(signedOn);
  check(!canonicalJson(saved).includes('undefined'), 'the saved form is plain JSON');
  const stored: unknown = JSON.parse(JSON.stringify(saved));
  check(canonicalJson(stored) === canonicalJson(saved), 'and reads back the same (it is part of the content hash)');

  // The company changes its form afterwards.
  const now = gcSetup((s) => {
    field(s, 'delays').label = 'Issues today';
    field(s, 'notes').on = false;
  }, 1);
  check(same(reportForm(GC, { status: 'submitted', form: stored }, now), signedOn), 'submitted: the form it was signed on, whatever the company has now');
  check(same(reportForm(GC, { status: 'draft', form: null }, now), companyForm(GC, now)), 'a draft follows the company\'s form');
  check(reportForm(GC, { status: 'submitted', form: null }, now) === GC, 'signed before forms could be set up: the standard form');
  check(reportForm(GC, { status: 'submitted', form: { daily: 'x' } }, now) === null, 'a saved form that cannot be read says so');
  check(reportForm(VIS, { status: 'draft', form: null }, now) === VIS && reportForm(VIS, { status: 'submitted', form: null }, now) === VIS, 'a fixed form is itself');
  check(same(formSnapshot(GC), { shortTitle: 'Weather', daily: GC.daily, tables: tablesOf(GC) }), 'the standard form\'s snapshot is its fields and tables');
});
