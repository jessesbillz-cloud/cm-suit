import { describe, expect, it } from 'vitest';
import { ORG_SETTINGS_DEFAULTS, PROJECT_SETTINGS_DEFAULTS, parseOrgSettings, parseProjectSettings } from './settings';

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
});
