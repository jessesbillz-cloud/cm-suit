// The mock user's daily setups on the sample jobs, there from the start like an inspector's jobs in My Daily Reports,
// so All my jobs shows today's report for each (0045) before a first visit to Dailies. Each is what Setup makes on first
// use (lib/dailies newSetupSettings, prefilled from the job). Sample Job A is written every day, so its report is due
// on any day the tests run; the VIS job is Monday to Friday. Synthetic by construction (CLAUDE.md rule 8).
import { DAILY_REPORT_TYPE, newSetupSettings } from '../../lib/dailies';
import type { DailySetupRow } from '../dailies.types';

interface Seed {
  projectId: string;
  reportType: string;
  name: string;
  number: string;
  isDsa: boolean;
  days?: number[];
}

const SEEDS: Seed[] = [
  { projectId: 'job-a', reportType: DAILY_REPORT_TYPE, name: 'Sample Job A', number: 'S-100', isDsa: false, days: [0, 1, 2, 3, 4, 5, 6] },
  { projectId: 'job-b', reportType: DAILY_REPORT_TYPE, name: 'Sample Job B', number: 'S-200', isDsa: false },
  { projectId: 'job-v', reportType: 'vis_daily', name: 'Sample School Wing', number: 'S-400', isDsa: true },
];

/** The mock profile's name (data/mock/fixtures mockProfile), as Setup prefills it. */
const AUTHOR = 'Sample PM';

export function dailySetupSeeds(): DailySetupRow[] {
  return SEEDS.map((s) => {
    const settings = newSetupSettings(s.reportType, {
      project_name: s.name,
      project_number: s.number,
      author_name: AUTHOR,
      is_dsa: s.isDsa,
    });
    return {
      id: `mock-setup-${s.projectId}`,
      project_id: s.projectId,
      report_type: s.reportType,
      settings: s.days ? { ...settings, schedule_days: s.days } : settings,
      version: 1,
      chosen_at: '2026-09-01T15:00:00Z',
    };
  });
}
