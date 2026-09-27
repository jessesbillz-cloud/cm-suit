// First run, step 1: name the company and say what kind it is. The next step (Add a job) appears on its own once the
// company exists, because the setup flow reads my companies from the database.
import { useState } from 'react';
import { useCreateOrg } from '../../data/jobs.mutations';
import { messageOf } from '../../data/errors';
import { ORG_KINDS } from '../../lib/jobs';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SelectField, TextField } from '../../ui/Fields';

interface CompanyStepProps {
  /** Prefilled from my profile's company, when I typed one. */
  initialName: string;
}

export function CompanyStep({ initialName }: CompanyStepProps) {
  const create = useCreateOrg();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<string>(ORG_KINDS[0].value);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <Card title="Set up your company">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === '') {
            setProblem('Enter the company name.');
            return;
          }
          setProblem(null);
          create.mutate(
            { name: name.trim(), kind },
            {
              onError: (err) => {
                setProblem(messageOf(err));
              },
            },
          );
        }}
      >
        <TextField label="Company name" value={name} onChange={setName} autoFocus autoComplete="organization" testId="setup-company-name" />
        <SelectField label="Type" value={kind} options={ORG_KINDS} onChange={setKind} />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" loading={create.isPending} data-testid="setup-company-next">
            Next
          </Button>
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
