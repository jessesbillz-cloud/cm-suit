// Add a job: only the name is required. No time zone question: the job takes its creator's zone (CLAUDE.md rule 14),
// and a bid due time typed here is read in that zone. The stage is prefilled from the company kind.
import { useState } from 'react';
import { useCreateJob } from '../../data/jobs.mutations';
import { messageOf } from '../../data/errors';
import type { MyOrg } from '../../data/types';
import { fromZonedInput } from '../../lib/dates';
import { defaultStage, isBidStage, STAGES } from '../../lib/jobs';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { CheckField, SelectField, TextField } from '../../ui/Fields';

interface NewJobFormProps {
  orgs: readonly MyOrg[];
  /** My time zone (the new job's zone). */
  zone: string;
  onCreated: (projectId: string) => void;
  onCancel?: (() => void) | undefined;
}

export function NewJobForm({ orgs, zone, onCreated, onCancel }: NewJobFormProps) {
  const create = useCreateJob();
  const first = orgs[0];
  const [orgId, setOrgId] = useState(first?.org_id ?? '');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [address, setAddress] = useState('');
  const [stage, setStage] = useState(defaultStage(first?.kind ?? ''));
  const [bidDue, setBidDue] = useState('');
  const [jobType, setJobType] = useState('');
  const [prevailingWage, setPrevailingWage] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    if (name.trim() === '') {
      setProblem('Enter the job name.');
      return;
    }
    setProblem(null);
    create.mutate(
      {
        orgId,
        name: name.trim(),
        stage,
        number,
        address,
        bidDueAt: isBidStage(stage) ? fromZonedInput(bidDue, zone) : null,
        prevailingWage,
        jobType,
      },
      {
        onSuccess: onCreated,
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <Card title="Add a job">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {orgs.length > 1 ? (
          <SelectField
            label="Company"
            value={orgId}
            options={orgs.map((o) => ({ value: o.org_id, label: o.name }))}
            onChange={setOrgId}
            className="sm:col-span-2"
          />
        ) : null}
        <TextField label="Job name" value={name} onChange={setName} autoFocus testId="setup-job-name" className="sm:col-span-2" />
        <TextField label="Job number" value={number} onChange={setNumber} />
        <SelectField label="Stage" value={stage} options={STAGES} onChange={setStage} />
        <TextField label="Address" value={address} onChange={setAddress} autoComplete="street-address" className="sm:col-span-2" />
        <TextField label="Job type" value={jobType} onChange={setJobType} />
        {isBidStage(stage) ? <TextField label="Bid due" type="datetime-local" value={bidDue} onChange={setBidDue} /> : null}
        <CheckField label="Prevailing wage" checked={prevailingWage} onChange={setPrevailingWage} />
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" loading={create.isPending} data-testid="setup-job-create">
            Create job
          </Button>
          {onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {problem ? (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
