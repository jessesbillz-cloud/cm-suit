import { describe, expect, it } from 'vitest';
import {
  DAILY_SETTINGS_DEFAULTS,
  asPdfName,
  dailyContentSchema,
  dailyFilenameFields,
  dailyHeaderSchema,
  dailySettingsSchema,
  needsResubmit,
  parseDailySettings,
} from './dailies';
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
