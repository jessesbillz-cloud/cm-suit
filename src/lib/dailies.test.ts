import { describe, expect, it } from 'vitest';
import {
  DAILY_REPORT_TYPE,
  DAILY_SETTINGS_DEFAULTS,
  FORM_CHOICES,
  activeReportType,
  asPdfName,
  dailyContentSchema,
  dailyFilenameFields,
  dailyHeaderSchema,
  dailySettingsSchema,
  dailyValues,
  formOf,
  needsResubmit,
  newSetupSettings,
  parseDailySettings,
  tablesOf,
} from './dailies';
import { NUMBER_CELLS } from '../../supabase/functions/_shared/reportForms';
import { buildFilename } from './buildFilename';

describe('daily report content schema', () => {
  it('fills every section from an empty object (a new report)', () => {
    const c = dailyContentSchema.parse({});
    expect(c.work).toEqual([]);
    expect(c.notes).toEqual({ general: '', safety: '', materials: '', equipment: '', qc: '' });
    expect(c.carry_sections).toEqual([]);
    expect(c.inspections).toEqual([]);
    expect(c.weather).toBe('');
    expect(c.standing_note).toBe('');
  });

  it('fills a work row and keeps what was typed', () => {
    const c = dailyContentSchema.parse({ work: [{ key: 'k1', company: 'Sample Concrete', hours: 8 }], notes: { safety: 'Hard hats' } });
    expect(c.work[0]).toEqual({ key: 'k1', company: 'Sample Concrete', description: '', headcount: null, hours: 8, carry: false });
    expect(c.notes.safety).toBe('Hard hats');
    expect(c.notes.general).toBe('');
  });

  it('refuses two rows with the same key (photos link to rows by key)', () => {
    const r = dailyContentSchema.safeParse({ work: [{ key: 'k1' }, { key: 'k1' }] });
    expect(r.success).toBe(false);
  });

  it('refuses bad values instead of guessing', () => {
    expect(dailyContentSchema.safeParse({ work: [{ key: 'k1', hours: -1 }] }).success).toBe(false);
    expect(dailyContentSchema.safeParse({ work: [{ key: 'k1', headcount: 2.5 }] }).success).toBe(false);
    expect(dailyContentSchema.safeParse({ carry_sections: ['lunch'] }).success).toBe(false);
  });

  it('drops keys it does not know', () => {
    const c = dailyContentSchema.parse({ surprise: 1 });
    expect('surprise' in c).toBe(false);
  });
});

describe('daily setup settings', () => {
  it('defaults everything (one place)', () => {
    expect(parseDailySettings(null)).toEqual(DAILY_SETTINGS_DEFAULTS);
    expect(parseDailySettings({})).toEqual(DAILY_SETTINGS_DEFAULTS);
  });

  it('keeps saved values and falls back only for a bad field', () => {
    const s = parseDailySettings({ label: 'Super Daily', submit_by: 'noon', schedule_days: [5, 1, 1] });
    expect(s.label).toBe('Super Daily');
    expect(s.submit_by).toBe(DAILY_SETTINGS_DEFAULTS.submit_by);
    expect(s.schedule_days).toEqual([1, 5]);
  });

  it('checks recipients when saving', () => {
    const ok = dailySettingsSchema.safeParse({ ...DAILY_SETTINGS_DEFAULTS, recipients: ['PM@Example.test'] });
    expect(ok.success && ok.data.recipients).toEqual(['pm@example.test']);
    const bad = dailySettingsSchema.safeParse({ ...DAILY_SETTINGS_DEFAULTS, recipients: ['not an email'] });
    expect(bad.success).toBe(false);
  });

  it('builds the default filename with the report number and job', () => {
    const header = dailyHeaderSchema.parse({ project_name: 'Sample Job A', timezone: 'America/Los_Angeles' });
    expect(header.label).toBe('Daily Report');
    const name = buildFilename(DAILY_SETTINGS_DEFAULTS.filename_pattern, { number: 41, date: '2026-09-28', fields: dailyFilenameFields(header) });
    expect(asPdfName(name)).toBe('Daily Report 41 Sample Job A 09-28-2026.pdf');
    expect(asPdfName('Report.PDF')).toBe('Report.PDF');
  });
});

describe('company forms (SPEC §8.3)', () => {
  const known = { project_name: 'Sample School Wing', project_number: 'S-400', author_name: 'Pat Sample', is_dsa: true };

  it('the form I write: the setup chosen last, else my role\'s form, else the company\'s form, else the work log', () => {
    const setups = [
      { report_type: 'daily', chosen_at: '2026-09-27T16:00:00.000000+00:00' },
      { report_type: 'vis_daily', chosen_at: '2026-09-28T16:00:00.000000+00:00' },
    ];
    expect(activeReportType(setups, 'gc_daily', null)).toBe('vis_daily');
    expect(activeReportType([], 'gc_daily', 'vis_daily')).toBe('gc_daily');
    expect(activeReportType([], 'foreman_daily', null)).toBe('foreman_daily');
    expect(activeReportType([], null, 'vis_daily')).toBe('vis_daily');
    expect(activeReportType([], 'unknown_form', 'unknown_form')).toBe(DAILY_REPORT_TYPE);
    expect(activeReportType([], null, null)).toBe(DAILY_REPORT_TYPE);
  });

  it('a new superintendent or foreman setup: the form\'s name and filename, no job values to type', () => {
    const gc = newSetupSettings('gc_daily', known);
    expect(gc.label).toBe('Daily Report');
    expect(gc.filename_pattern).toBe('Daily Report {#} {Project} {MM-DD-YYYY}');
    expect(gc.locked).toEqual({});
    expect(newSetupSettings('foreman_daily', known).filename_pattern).toBe('Foreman Daily {#} {Project} {MM-DD-YYYY}');
    expect(FORM_CHOICES.map((c) => c.value)).toEqual(['daily', 'vis_daily', 'gc_daily', 'foreman_daily']);
  });

  it('every table\'s number columns are the cells carryover clears (SQL daily_carryover: count, hours)', () => {
    for (const choice of FORM_CHOICES) {
      const form = formOf(choice.value);
      if (!form) continue;
      for (const t of tablesOf(form)) {
        for (const c of t.columns) {
          expect((NUMBER_CELLS as readonly string[]).includes(c.key)).toBe(c.number === true);
        }
        expect(new Set(t.columns.map((c) => c.key)).size).toBe(t.columns.length);
      }
      const keys = [...form.daily.map((f) => f.key), ...tablesOf(form).map((t) => t.key)];
      expect(keys.every((k) => /^[a-z0-9_]{1,40}$/.test(k))).toBe(true);
      expect(form.daily.some((f) => f.key === form.standing)).toBe(true);
    }
  });

  it('a report keeps its tables; duplicate row keys in a table are refused', () => {
    const c = dailyContentSchema.parse({ tables: { manpower: [{ key: 'm1', cells: { company: 'Sample Framing', count: '4' } }] } });
    expect(c.tables['manpower']).toEqual([{ key: 'm1', ref: null, carry: false, cells: { company: 'Sample Framing', count: '4' } }]);
    expect(c.pulled).toEqual([]);
    expect(dailyContentSchema.safeParse({ tables: { manpower: [{ key: 'm1' }, { key: 'm1' }] } }).success).toBe(false);
    expect(dailyContentSchema.safeParse({ tables: { crew: [{ key: 'c1' }], work: [{ key: 'c1' }] } }).success).toBe(true);
  });

  it('a new VIS setup: the form\'s name and filename, job values prefilled, everything else the defaults', () => {
    const s = newSetupSettings('vis_daily', known);
    expect(s.filename_pattern).toBe('DR_{#}_{Project_}_{YYYY-MM-DD}');
    expect(s.locked).toMatchObject({ project_name: 'Sample School Wing', project_no: 'S-400', jurisdiction: 'DSA', ior: 'Pat Sample', architect: '' });
    expect(s.schedule_days).toEqual(DAILY_SETTINGS_DEFAULTS.schedule_days);
    expect(dailySettingsSchema.safeParse(s).success).toBe(true);
    const name = buildFilename(s.filename_pattern, { number: 233, date: '2026-09-28', fields: { Project: 'Sample School Wing' } });
    expect(asPdfName(name)).toBe('DR_233_Sample_School_Wing_2026-09-28.pdf');
  });

  it('a new work-log setup is just the defaults', () => {
    expect(newSetupSettings(DAILY_REPORT_TYPE, known)).toEqual(DAILY_SETTINGS_DEFAULTS);
  });

  it('IOR Notes start as the standing note until typed in, even when cleared', () => {
    const form = formOf('vis_daily');
    if (!form) throw new Error('vis_daily is a form');
    expect(dailyValues(form, {}, 'Standing').ior_notes).toBe('Standing');
    expect(dailyValues(form, { ior_notes: '' }, 'Standing').ior_notes).toBe('');
    expect(dailyValues(form, { contractor_activity: 'Framing' }, '').contractor_activity).toBe('Framing');
    expect(formOf(DAILY_REPORT_TYPE)).toBeNull();
  });

  it('a report keeps its form values; bad keys are refused', () => {
    expect(dailyContentSchema.parse({ fields: { ior_notes: 'x' } }).fields).toEqual({ ior_notes: 'x' });
    expect(dailyContentSchema.safeParse({ fields: { 'Bad Key': 'x' } }).success).toBe(false);
  });
});

describe('needsResubmit', () => {
  const signed = { status: 'submitted', version: 6, signed_version: 6, signed_at: '2026-09-28T23:00:00.000Z' };

  it('is false for a draft and for an unchanged submitted report', () => {
    expect(needsResubmit({ ...signed, status: 'draft' }, [])).toBe(false);
    expect(needsResubmit(signed, [{ updated_at: '2026-09-28T22:59:00.000Z' }])).toBe(false);
  });

  it('is true once the content was saved again after signing', () => {
    expect(needsResubmit({ ...signed, version: 7 }, [])).toBe(true);
  });

  it('is true when a photo changed or was removed after signing', () => {
    expect(needsResubmit(signed, [{ updated_at: '2026-09-28T23:05:00.000Z' }])).toBe(true);
  });
});
