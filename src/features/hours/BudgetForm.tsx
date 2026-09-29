// My contract hours on the job (right column): the contract, the hours used before tracking started and the last day
// those cover. Saved with a version check; only I ever read them.
import { useState } from 'react';
import { Save } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useSaveHoursBudget } from '../../data/hours.mutations';
import { useHoursBudget } from '../../data/hours.queries';
import type { HoursBudgetRow } from '../../data/hours.types';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

interface FormProps {
  projectId: string;
  budget: HoursBudgetRow | null;
  onSaved: () => void;
}

function amount(text: string, max: number): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  return n <= max ? n : null;
}

function Form({ projectId, budget, onSaved }: FormProps) {
  const save = useSaveHoursBudget(projectId);
  const toast = useToast();
  const [contract, setContract] = useState(budget ? String(budget.contract_hours) : '');
  const [baseline, setBaseline] = useState(budget && budget.baseline_hours > 0 ? String(budget.baseline_hours) : '');
  const [through, setThrough] = useState(budget?.baseline_through ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const c = amount(contract, 100000);
    const b = baseline.trim() === '' ? 0 : amount(baseline, 100000);
    if (c === null || b === null) {
      setProblem('Hours are whole numbers or tenths.');
      return;
    }
    if (b > 0 && through === '') {
      setProblem('Add the day the baseline runs through.');
      return;
    }
    setProblem(null);
    save.mutate(
      { contract: c, baseline: b, through: through === '' ? null : through, version: budget?.version ?? null },
      {
        onSuccess: () => {
          toast.show({ message: 'Contract hours saved.' });
          onSaved();
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4 p-4"
      data-testid="hours-contract-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField label="Contract" value={contract} onChange={setContract} testId="hours-contract-input" autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Used before" value={baseline} onChange={setBaseline} testId="hours-baseline-input" />
        <TextField label="Through" type="date" value={through} onChange={setThrough} testId="hours-through-input" />
      </div>
      {problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" icon={Save} loading={save.isPending} data-testid="hours-contract-save">
          Save
        </Button>
      </div>
    </form>
  );
}

interface BudgetFormProps {
  projectId: string;
  onSaved: () => void;
}

export function BudgetForm({ projectId, onSaved }: BudgetFormProps) {
  const budget = useHoursBudget(projectId);
  if (budget.isPending) return <LoadingState label="Loading contract hours" />;
  if (budget.isError) return <ErrorState error={budget.error} onRetry={() => void budget.refetch()} />;
  return <Form key={budget.data?.version ?? 0} projectId={projectId} budget={budget.data} onSaved={onSaved} />;
}
