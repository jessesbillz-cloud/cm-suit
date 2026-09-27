// "Add sub": company and trades, then the new sub opens in the right column for the rest.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useProject } from '../../data/queries';
import { useAddSub } from '../../data/subs.mutations';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { parseTrades } from './subs';

interface AddSubFormProps {
  projectId: string;
  onAdded: (subId: string) => void;
}

export function AddSubForm({ projectId, onAdded }: AddSubFormProps) {
  const project = useProject(projectId);
  const add = useAddSub();
  const [company, setCompany] = useState('');
  const [trades, setTrades] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  if (project.isPending) return <LoadingState label="Loading" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  const orgId = project.data.org_id;

  function submit() {
    const name = company.replace(/\s+/g, ' ').trim();
    const codes = parseTrades(trades);
    if (name === '') {
      setProblem('Company is empty.');
      return;
    }
    if (codes === null) {
      setProblem('Trades look like 09A.');
      return;
    }
    setProblem(null);
    add.mutate(
      { orgId, company: name, trades: codes },
      {
        onSuccess: (row) => {
          onAdded(row.id);
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField label="Company" value={company} onChange={setCompany} autoFocus testId="new-sub-company" />
      <TextField label="Trades" value={trades} onChange={setTrades} testId="new-sub-trades" />
      {problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="primary" icon={Plus} loading={add.isPending} className="w-fit">
        Add
      </Button>
    </form>
  );
}
