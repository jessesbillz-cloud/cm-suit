import { describe, expect, it } from 'vitest';
import { ORG_SETTINGS_DEFAULTS, PROJECT_SETTINGS_DEFAULTS, parseOrgSettings, parseProjectSettings } from './settings';

describe('settings', () => {
  it('fills defaults for empty or broken jsonb', () => {
    expect(parseOrgSettings({})).toEqual(ORG_SETTINGS_DEFAULTS);
    expect(parseOrgSettings(null)).toEqual(ORG_SETTINGS_DEFAULTS);
    expect(parseProjectSettings([])).toEqual(PROJECT_SETTINGS_DEFAULTS);
  });
  it('keeps valid values and replaces invalid ones', () => {
    expect(parseProjectSettings({ rfi_turnaround_days: 7, show_ball_in_court: 'yes' })).toEqual({
      rfi_turnaround_days: 7,
      show_ball_in_court: false,
    });
    expect(parseOrgSettings({ report_generator: 'vis_daily' }).report_generator).toBe('vis_daily');
  });
});
