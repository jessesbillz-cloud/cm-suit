// Timesheets (SPEC §15, All my jobs): a month of my hours across my jobs as the timesheet prints it (by job and day,
// with my contract table), the signed timesheet PDF (rendered on the server; a signed record, so SignButton), and my
// invoices (and my billing details, beside them). A timesheet is per company: with jobs from more than one, pick one.
import type { ReactNode } from 'react';
import { useHoursJobs, useMonthHours } from '../../data/hours.queries';
import { useTimesheetPdf } from '../../data/hours.mutations';
import type { HoursJob } from '../../data/hours.types';
import { hoursText, monthLabel } from '../../lib/timesheet';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Segments } from '../../ui/Segments';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { TOOL_META } from '../../ui/tools';
import { SignButton } from '../auth/SignButton';
import { InvoicesCard } from './InvoicesCard';
import { ContractTable, HoursGrid } from './MonthTables';
import { MonthStepper } from './MonthStepper';
import { useTimesheetsNav } from './useTimesheetsNav';

interface TimesheetsToolProps {
  itemId: string | null;
  isPhone: boolean;
}

const META = TOOL_META.timesheets;

/** My companies (a job's company), in job-name order, once each. */
function companiesOf(jobs: readonly HoursJob[]): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const j of jobs) if (!seen.has(j.org_id)) seen.set(j.org_id, j.org_name || 'Company');
  return [...seen].map(([value, label]) => ({ value, label }));
}

interface MonthProps {
  jobs: readonly HoursJob[];
  orgId: string;
  month: string;
  itemId: string | null;
  isPhone: boolean;
  below: ReactNode;
  onOpen: (id: string) => void;
}

function Month({ jobs, orgId, month, itemId, isPhone, below, onOpen }: MonthProps) {
  const hours = useMonthHours(jobs, month);
  const pdf = useTimesheetPdf();
  const toast = useToast();
  const empty = hours.data !== undefined && hours.data.grid.length === 0 && hours.data.budgets.length === 0;
  const actions = (
    <SignButton
      label="Sign timesheet"
      testId="timesheet-sign"
      pending={pdf.isPending}
      disabled={hours.data === undefined || empty}
      sign={() => pdf.mutateAsync({ month, orgId })}
      onSigned={() => {
        toast.show({ message: `${monthLabel(month)} timesheet saved.` });
      }}
    />
  );
  const meta = hours.data ? `${monthLabel(month)} · ${hoursText(hours.data.total)} h` : monthLabel(month);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4" data-testid="timesheets-tool">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      <Card title="Hours" padded={false} className="overflow-hidden">
        {hours.isPending ? <LoadingState label="Loading hours" /> : null}
        {hours.isError ? <ErrorState error={hours.error} onRetry={() => void hours.refetch()} /> : null}
        {hours.data?.grid.length === 0 ? <EmptyState icon={META.icon} title={`No hours in ${monthLabel(month)}.`} /> : null}
        {hours.data && hours.data.grid.length > 0 ? <HoursGrid month={month} hours={hours.data} isPhone={isPhone} /> : null}
      </Card>
      {hours.data && hours.data.budgets.length > 0 ? (
        <Card title="Contract" padded={false} className="overflow-hidden">
          <ContractTable budgets={hours.data.budgets} isPhone={isPhone} />
        </Card>
      ) : null}
      <InvoicesCard month={month} selectedId={itemId} onOpen={onOpen} isPhone={isPhone} />
    </div>
  );
}

export function TimesheetsTool({ itemId, isPhone }: TimesheetsToolProps) {
  const nav = useTimesheetsNav();
  const jobs = useHoursJobs();

  if (jobs.isPending || jobs.isError) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={META.label} icon={META.icon} />
        <Card>
          {jobs.isPending ? <LoadingState label="Loading your jobs" /> : <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />}
        </Card>
      </div>
    );
  }
  const companies = companiesOf(jobs.data);
  const org = companies.find((c) => c.value === nav.org) ?? companies[0];
  if (!org) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={META.label} icon={META.icon} />
        <Card>
          <EmptyState icon={META.icon} title="No jobs with Hours." />
        </Card>
      </div>
    );
  }
  const below = (
    <div className="flex flex-wrap items-center gap-2">
      <MonthStepper
        month={nav.month}
        onPick={(m) => {
          nav.setMonth(m, itemId);
        }}
      />
      {companies.length > 1 ? (
        <Segments
          kind="radio"
          label="Company"
          testId="timesheets-company"
          options={companies}
          value={org.value}
          onPick={(v) => {
            nav.setOrg(v, itemId);
          }}
        />
      ) : null}
    </div>
  );
  return (
    <Month
      jobs={jobs.data.filter((j) => j.org_id === org.value)}
      orgId={org.value}
      month={nav.month}
      itemId={itemId}
      isPhone={isPhone}
      below={below}
      onOpen={nav.open}
    />
  );
}
