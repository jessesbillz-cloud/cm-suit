import { describe, expect, it } from 'vitest';
import { ORG_SETTINGS_DEFAULTS, PROJECT_SETTINGS_DEFAULTS, parseFireList, parseOrgSettings, parseProjectSettings } from './settings';

describe('settings', () => {
  it('fills defaults for empty or broken jsonb', () => {
    expect(parseOrgSettings({})).toEqual(ORG_SETTINGS_DEFAULTS);
    expect(parseOrgSettings(null)).toEqual(ORG_SETTINGS_DEFAULTS);
    expect(parseProjectSettings([])).toEqual(PROJECT_SETTINGS_DEFAULTS);
  });
  it('keeps valid values and replaces invalid ones', () => {
    expect(parseProjectSettings({ show_ball_in_court: 'yes' })).toMatchObject({ show_ball_in_court: false });
    expect(parseProjectSettings({ show_ball_in_court: true })).toMatchObject({ show_ball_in_court: true });
    expect(parseProjectSettings({ ir_gc_approval: true, ir_ofs_allowed: 'no' })).toMatchObject({
      ir_gc_approval: true,
      ir_ofs_allowed: false,
    });
    expect(parseOrgSettings({ report_generator: 'vis_daily' }).report_generator).toBe('vis_daily');
  });
  it('reads a blank OFS attestation wording as the standard one (null)', () => {
    expect(parseProjectSettings({ ir_ofs_attest_text: '   ' }).ir_ofs_attest_text).toBeNull();
    expect(parseProjectSettings({ ir_ofs_attest_text: ' Sample VIS wording ' }).ir_ofs_attest_text).toBe('Sample VIS wording');
  });
  it("the job's fire list: its own entries, else the standard one (null); typed with commas or spaces in a section", () => {
    expect(parseProjectSettings({ ofs_fire_sections: ['21', '0784', '078100'] }).ofs_fire_sections).toEqual(['21', '0784', '078100']);
    expect(parseProjectSettings({ ofs_fire_sections: ['nope'] }).ofs_fire_sections).toBeNull();
    expect(parseProjectSettings({ ofs_fire_sections: [] }).ofs_fire_sections).toBeNull();
    expect(parseFireList('21, 28; 07 81 00\n0784, 21')).toEqual({ list: ['078100', '0784', '21', '28'], bad: [] });
    expect(parseFireList('21, 2x, 0781000')).toEqual({ list: ['21'], bad: ['2x', '0781000'] });
    expect(parseFireList('  ')).toEqual({ list: null, bad: [] });
  });
});
