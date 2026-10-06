// Who does what one person at a time on this job (0091 duties), on the job's People screen. The first duty: who sends
// OFS requests. The owner or CM picks the company (the GC until someone picks), that company's admin picks the person
// and changes them. Everyone else reads who it is. Saved on change, with the version check.
import { messageOf } from '../../data/errors';
import { useDuties, useSetDuty, type Duty } from '../../data/inspections.ofs';
import { useProject } from '../../data/queries';
import { Card } from '../../ui/Card';
import { SelectField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';

const NOBODY = '';

function Value({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
      {label}
      <span className="flex h-10 items-center text-sm font-semibold text-ink" data-testid={testId}>
        {text}
      </span>
    </div>
  );
}

function OfsDuty({ projectId, duty }: { projectId: string; duty: Duty }) {
  const set = useSetDuty();
  const company = duty.company ?? '';
  const companies = duty.companies.includes(company) || company === '' ? duty.companies : [company, ...duty.companies];
  return (
    <div className="flex flex-col gap-2" data-testid="duty-ofs">
      <div className="grid gap-3 sm:grid-cols-2">
        {duty.can_assign ? (
          <SelectField
            label="Company"
            value={company}
            options={companies.map((c) => ({ value: c, label: c }))}
            testId="duty-ofs-company"
            onChange={(c) => {
              set.mutate({ projectId, duty, company: c });
            }}
          />
        ) : (
          <Value label="Company" text={company || 'Nobody yet'} testId="duty-ofs-company-name" />
        )}
        {duty.can_pick ? (
          <SelectField
            label="Person"
            value={duty.person_id ?? NOBODY}
            options={[{ value: NOBODY, label: 'Nobody yet' }, ...duty.people.map((p) => ({ value: p.id, label: p.name }))]}
            testId="duty-ofs-person"
            onChange={(id) => {
              set.mutate({ projectId, duty, personId: id === NOBODY ? null : id });
            }}
          />
        ) : (
          <Value label="Person" text={duty.person_name ?? 'Nobody yet'} testId="duty-ofs-person-name" />
        )}
      </div>
      {set.isError ? <p className="text-sm text-danger">{messageOf(set.error)}</p> : null}
    </div>
  );
}

export function DutyCard({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const on = project.data !== undefined && project.data.modules.includes('inspections') && project.data.parsedSettings.ir_ofs_allowed;
  const duties = useDuties(projectId, on);
  if (!on) return null;
  const duty = duties.data?.find((d) => d.duty === 'ofs_requests');
  return (
    <Card title="OFS requests">
      {duties.isPending ? <LoadingState label="Loading" /> : null}
      {duties.isError ? <ErrorState error={duties.error} onRetry={() => void duties.refetch()} className="m-0" /> : null}
      {duty ? <OfsDuty projectId={projectId} duty={duty} /> : null}
    </Card>
  );
}
