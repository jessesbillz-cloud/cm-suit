// A synthetic GC job being built, where the mock users 'super' and 'foreman' write their dailies on the forms their
// roles default to (roles.daily_form: the superintendent's daily, the foreman's daily), with that day's tailgate
// sign-ins and deliveries to fill them (safetySeeds, deliveries). Everyone else is the PM there. Obviously fake names
// (CLAUDE.md rule 8). Its name sorts after Sample Job A and B, the jobs the app opens first.
import type { ProjectRow } from '../types';
import { mockUser } from './index';

const GC_JOB_ID = 'job-g';

/** A synthetic copy of roles.daily_form for the roles the mock users take here. */
const ROLE_FORMS: Readonly<Record<string, string>> = { superintendent: 'gc_daily', foreman: 'foreman_daily' };

export function gcJobRows(): ProjectRow[] {
  return [
    {
      id: GC_JOB_ID,
      org_id: 'org-sample',
      name: 'Sample Medical Office',
      number: 'S-500',
      // An address, so its dailies get the day's weather (mock/weather: the pretend geocoder matches it).
      address: '100 Sample Street, Sampletown, CA 90000',
      timezone: 'America/Los_Angeles',
      stage: 'construction',
      modules: ['files', 'calendar', 'dailies', 'inspections', 'deliveries', 'corrections', 'safety'],
      settings: {},
      version: 1,
      job_type: null,
      prevailing_wage: true,
      bid_due_at: null,
      bid_sealed: false,
      is_dsa: false,
    },
  ];
}

/** The mock user's role on the GC job, or null for another job. */
export function gcJobRole(projectId: string): string | null {
  if (projectId !== GC_JOB_ID) return null;
  const who = mockUser().id.replace(/^mock-user-/, '');
  if (who === 'super') return 'superintendent';
  return who === 'foreman' ? 'foreman' : 'pm';
}

/** my_daily_form in the mock: the mock user's role's form on that job. */
export function gcJobForm(projectId: string): string | null {
  const role = gcJobRole(projectId);
  return role === null ? null : (ROLE_FORMS[role] ?? null);
}
