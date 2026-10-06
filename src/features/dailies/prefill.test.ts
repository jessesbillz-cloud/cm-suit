import { describe, expect, it } from 'vitest';
import type { DayFacts } from '../../data/dailies.types';
import { dailyContentSchema, formOf, formSetupSchema, fullSetup, tablesOf, type DailyContent, type FormSetup, type ReportForm } from '../../lib/dailies';
import { companyForm } from '../../../supabase/functions/_shared/reportForms';
import { pullFacts, SOURCE_CELLS } from './prefill';

function form(id: string): ReportForm {
  const f = formOf(id);
  if (!f) throw new Error(`${id} is a form`);
  return f;
}

const GC = form('gc_daily');
const AT = { day: '2026-09-29', tz: 'America/Los_Angeles' };

const FACTS: DayFacts = {
  signins: [
    { company: 'Sample Electric', trade: 'Electrician', count: 2 },
    { company: 'Sample Framing Co', trade: 'Framer', count: 3 },
  ],
  meetings: [{ id: 'm1', kind: 'tailgate', number: 4, title: 'Heat illness', signed: 6 }],
  deliveries: [
    // 13:30 UTC = 6:30 AM in Los Angeles that day.
    { id: 'd1', number: 1, starts_at: '2026-09-29T13:30:00Z', company: 'Sample Concrete Co', description: 'Footing pour', standby: false },
    { id: 'd2', number: 2, starts_at: null, company: 'Sample Steel Co', description: 'Embeds', standby: true },
  ],
  inspections: [
    {
      id: 'i1', number: 7, kind: 'ior', special: null, items: 'Shear walls', start_time: '08:00', status: 'confirmed', result: null, helper_id: null,
      company: 'Sample Framing Co', ofs_sent: false,
    },
    {
      id: 'i2', number: 8, kind: 'special', special: 'Concrete', items: 'Footings', start_time: null, status: 'pending', result: null, helper_id: null,
      company: 'Sample Concrete Co', ofs_sent: false,
    },
  ],
  received: [],
};

function content(v: unknown = {}): DailyContent {
  return dailyContentSchema.parse(v);
}

function pulled(c: DailyContent | null): DailyContent {
  if (c === null) throw new Error('expected something to fill in');
  return dailyContentSchema.parse(c);
}

describe('filling a report from the day (daily_day_facts)', () => {
  it('fills manpower, deliveries, inspections and the tailgate line on a new report', () => {
    const c = pulled(pullFacts(GC, content(), FACTS, AT));
    expect(c.tables['manpower']?.map((r) => r.cells)).toEqual([
      { company: 'Sample Electric', trade: 'Electrician', count: '2' },
      { company: 'Sample Framing Co', trade: 'Framer', count: '3' },
    ]);
    expect(c.tables['manpower']?.every((r) => r.carry)).toBe(true);
    expect(c.tables['deliveries']?.map((r) => r.cells)).toEqual([
      { time: '6:30 AM', company: 'Sample Concrete Co', material: 'Footing pour' },
      { time: 'TBD', company: 'Sample Steel Co', material: 'Embeds (standby)' },
    ]);
    expect(c.tables['deliveries']?.every((r) => !r.carry)).toBe(true);
    expect(c.tables['inspections']?.map((r) => r.cells)).toEqual([
      { time: '8:00 AM', inspection: 'IOR #7: Shear walls', result: 'Confirmed' },
      { time: 'Flexible', inspection: 'Special: Concrete #8: Footings', result: 'Pending' },
    ]);
    expect(c.fields['safety']).toBe('Tailgate held: Heat illness (6 signed in)');
    expect(c.pulled).toHaveLength(7);
  });

  it('is done once: asking again changes nothing, and a row taken off stays off', () => {
    const once = pulled(pullFacts(GC, content(), FACTS, AT));
    expect(pullFacts(GC, once, FACTS, AT)).toBeNull();
    const removed = { ...once, tables: { ...once.tables, deliveries: once.tables['deliveries']?.slice(1) ?? [] } };
    expect(pullFacts(GC, removed, FACTS, AT)).toBeNull();
  });

  it('never replaces what was typed: a carried manpower row gets only an empty count', () => {
    const start = content({
      fields: { safety: 'Housekeeping walk at 10.' },
      tables: {
        manpower: [
          { key: 'a', carry: true, cells: { company: 'sample framing co', trade: 'framer' } },
          { key: 'b', carry: true, cells: { company: 'Sample Electric', trade: 'Electrician', count: '5' } },
        ],
      },
    });
    const c = pulled(pullFacts(GC, start, FACTS, AT));
    expect(c.tables['manpower']?.map((r) => [r.key, r.cells['count']])).toEqual([['a', '3'], ['b', '5']]);
    expect(c.fields['safety']).toBe('Housekeeping walk at 10.\nTailgate held: Heat illness (6 signed in)');
  });

  it('what came in later fills in later; an inspection result follows the request until someone types over it', () => {
    const morning = pulled(pullFacts(GC, content(), { ...FACTS, deliveries: [], meetings: [] }, AT));
    expect(morning.tables['deliveries'] ?? []).toEqual([]);
    const later = { ...FACTS, inspections: FACTS.inspections.map((r) => (r.id === 'i1' ? { ...r, status: 'complete', result: 'approved' } : r)) };
    const afternoon = pulled(pullFacts(GC, morning, later, AT));
    expect(afternoon.tables['deliveries']).toHaveLength(2);
    expect(afternoon.tables['inspections']?.[0]?.cells['result']).toBe('Approved');
    const typed = {
      ...afternoon,
      tables: { ...afternoon.tables, inspections: (afternoon.tables['inspections'] ?? []).map((r, i) => (i === 1 ? { ...r, cells: { ...r.cells, result: 'Footings poured, see notes' } } : r)) },
    };
    const approved = { ...later, inspections: later.inspections.map((r) => ({ ...r, status: 'complete', result: 'approved' })) };
    expect(pulled(pullFacts(GC, afternoon, approved, AT)).tables['inspections']?.[1]?.cells['result']).toBe('Approved');
    expect(pullFacts(GC, typed, approved, AT)).toBeNull();
  });

  /** The superintendent's daily as a company set it up. */
  function companyGc(change: (s: FormSetup) => void): ReportForm {
    const s = fullSetup(GC, null);
    change(s);
    return companyForm(GC, formSetupSchema.parse(s));
  }

  it("fills the company's version of the form: a table, a column or the safety field turned off is left alone", () => {
    const theirs = companyGc((s) => {
      for (const t of s.tables) {
        if (t.key === 'deliveries') t.on = false;
        if (t.key === 'inspections') for (const c of t.columns) c.on = c.key !== 'time';
        if (t.key === 'manpower') t.label = 'Crews';
      }
      for (const f of s.fields) if (f.key === 'safety') f.on = false;
    });
    const c = pulled(pullFacts(theirs, content(), FACTS, AT));
    expect(c.tables['deliveries']).toBeUndefined();
    expect(c.tables['inspections']?.map((r) => r.cells)).toEqual([
      { inspection: 'IOR #7: Shear walls', result: 'Confirmed' },
      { inspection: 'Special: Concrete #8: Footings', result: 'Pending' },
    ]);
    expect(c.tables['manpower']).toHaveLength(2);
    expect(c.fields['safety']).toBeUndefined();
    expect(c.pulled).toHaveLength(4);
    expect(pullFacts(theirs, c, FACTS, AT)).toBeNull();
  });

  it('a manpower table without Trade counts each company once; without either, everyone together', () => {
    const facts = { ...FACTS, signins: [...FACTS.signins, { company: 'Sample Framing Co', trade: 'Laborer', count: 2 }] };
    const noTrade = companyGc((s) => {
      for (const t of s.tables) if (t.key === 'manpower') for (const c of t.columns) c.on = c.key !== 'trade';
    });
    const byCompany = pulled(pullFacts(noTrade, content(), facts, AT));
    expect(byCompany.tables['manpower']?.map((r) => r.cells)).toEqual([
      { company: 'Sample Electric', count: '2' },
      { company: 'Sample Framing Co', count: '5' },
    ]);
    expect(pullFacts(noTrade, byCompany, facts, AT)).toBeNull();
    const neither = companyGc((s) => {
      for (const t of s.tables) if (t.key === 'manpower') for (const c of t.columns) c.on = c.key === 'count' || c.key === 'hours';
    });
    expect(pulled(pullFacts(neither, content(), facts, AT)).tables['manpower']?.map((r) => r.cells)).toEqual([{ count: '7' }]);
  });

  it('the foreman form and the work log have nothing to fill', () => {
    expect(pullFacts(form('foreman_daily'), content(), FACTS, AT)).toBeNull();
    expect(pullFacts(form('vis_daily'), content(), FACTS, AT)).toBeNull();
  });

  it('every table with a source has the cells that source fills', () => {
    for (const id of ['vis_daily', 'gc_daily', 'foreman_daily']) {
      for (const t of tablesOf(form(id))) {
        if (t.source === undefined) continue;
        const keys = t.columns.map((c) => c.key);
        expect(SOURCE_CELLS[t.source].every((k) => keys.includes(k))).toBe(true);
      }
    }
  });
});
