// The form I write on a job (SPEC §8.3, §13.1): the setup I chose last; else my role's form (roles.daily_form: the
// superintendent's daily, the foreman's daily); else the company's form (orgs.settings report_generator); else the work
// log. And the settings a new setup of a form starts from, prefilled from the job.
import { useDailySetups, useMyDailyForm } from '../../data/dailies.queries';
import type { DailySetupRow } from '../../data/dailies.types';
import { useOrgSettings, useProfile } from '../../data/queries';
import type { ProjectRow } from '../../data/types';
import { activeReportType, formOf, newSetupSettings, type DailySettings, type ReportForm } from '../../lib/dailies';

interface DailyFormReady {
  status: 'ready';
  /** daily_reports.report_type of the form I write here. */
  reportType: string;
  /** The form, or null for the work log. */
  form: ReportForm | null;
  /** Its setup, or null before the first one is made. */
  setup: DailySetupRow | null;
  /** A new setup's settings for any form. */
  settingsFor: (reportType: string) => DailySettings;
}

type DailyFormState = { status: 'pending' } | { status: 'error'; error: Error; retry: () => void } | DailyFormReady;

export function useDailyForm(project: ProjectRow): DailyFormState {
  const setups = useDailySetups(project.id);
  const roleForm = useMyDailyForm(project.id);
  const org = useOrgSettings(project.org_id);
  const profile = useProfile();
  if (setups.isError) return { status: 'error', error: setups.error, retry: () => void setups.refetch() };
  if (roleForm.isError) return { status: 'error', error: roleForm.error, retry: () => void roleForm.refetch() };
  if (org.isError) return { status: 'error', error: org.error, retry: () => void org.refetch() };
  if (profile.isError) return { status: 'error', error: profile.error, retry: () => void profile.refetch() };
  if (setups.isPending || roleForm.isPending || org.isPending || profile.isPending) return { status: 'pending' };

  const reportType = activeReportType(setups.data, roleForm.data, org.data.report_generator);
  const known = {
    project_name: project.name,
    project_number: project.number ?? '',
    author_name: profile.data.full_name.trim() || (profile.data.email.split('@')[0] ?? ''),
    is_dsa: project.is_dsa,
  };
  return {
    status: 'ready',
    reportType,
    form: formOf(reportType),
    setup: setups.data.find((s) => s.report_type === reportType) ?? null,
    settingsFor: (t) => newSetupSettings(t, known),
  };
}
