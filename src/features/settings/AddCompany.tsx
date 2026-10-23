// Settings > Company, Add company: another company I run (create_org: I become its owner, the same name twice is the
// same company). Its card appears above with its own logo and letterhead, and Settings > Job > Brand can show it.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useCreateOrg } from '../../data/jobs.mutations';
import { ORG_KINDS } from '../../lib/jobs';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SelectField, TextField } from '../../ui/Fields';

function AddCompanyForm({ onDone }: { onDone: () => void }) {
  const create = useCreateOrg();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>(ORG_KINDS[0].value);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Card title="Add company">
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
              onSuccess: onDone,
              onError: (err) => {
                setProblem(messageOf(err));
              },
            },
          );
        }}
      >
        <TextField label="Company name" value={name} onChange={setName} autoFocus autoComplete="organization" testId="add-company-name" />
        <SelectField label="Type" value={kind} options={ORG_KINDS} onChange={setKind} testId="add-company-kind" />
        <div className="flex flex-wrap items-center gap-3">
          {problem ? (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          ) : null}
          <span className="flex-1" />
          <Button variant="quiet" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending} data-testid="add-company-save">
            Add
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AddCompany() {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <AddCompanyForm
        onDone={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <Button
      icon={Plus}
      className="self-start"
      data-testid="add-company"
      onClick={() => {
        setOpen(true);
      }}
    >
      Add company
    </Button>
  );
}
