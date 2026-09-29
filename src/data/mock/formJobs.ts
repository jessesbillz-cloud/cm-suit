// A synthetic inspection company whose daily report is a company form (orgs.settings.report_generator = 'vis_daily'),
// and one job of theirs the mock user is on, so the preview and e2e show that form's Setup and editor. The mock user is
// a member of the job, not of the company, so the company lists (Settings, New job) stay as they were. Obviously fake
// names (CLAUDE.md rule 8). The job's name sorts after the Sample Job A/B fixtures in the job picker.
import type { ProjectRow } from '../types';

export const FORM_ORG = { org_id: 'org-inspect', name: 'Sample Inspection Co', kind: 'inspector' } as const;

/** The company's settings row (parsed by lib/settings like any other). */
export const FORM_ORG_SETTINGS: Readonly<Record<string, unknown>> = { report_generator: 'vis_daily' };

export function formJobRows(): ProjectRow[] {
  return [
    {
      id: 'job-v',
      org_id: FORM_ORG.org_id,
      name: 'Sample School Wing',
      number: 'S-400',
      address: null,
      timezone: 'America/Los_Angeles',
      stage: 'construction',
      // An inspector company's job: Hours is on (0043).
      modules: ['files', 'calendar', 'dailies', 'inspections', 'corrections', 'hours'],
      settings: {},
      version: 1,
      job_type: null,
      prevailing_wage: false,
      bid_due_at: null,
      bid_sealed: false,
      is_dsa: true,
    },
  ];
}
