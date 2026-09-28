// "Add form": a form this job needs that the list doesn't have (e.g. an owner's own RFP form). Name and when it's
// due; the new form then opens on the right.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { FORM_TIMINGS, useAddBidForm, type FormTiming } from '../../data/bidForms';
import { messageOf } from '../../data/errors';
import { useProject } from '../../data/queries';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { TIMING_LABELS } from './forms';
import { useBidsNav } from './useBidsNav';

export function AddFormPane({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const add = useAddBidForm();
  const nav = useBidsNav(projectId);
  const [name, setName] = useState('');
  const [timing, setTiming] = useState<FormTiming>('with_bid');
  const [problem, setProblem] = useState<string | null>(null);

  if (project.isPending) return <LoadingState label="Loading" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  const orgId = project.data.org_id;

  function submit() {
    const clean = name.replace(/\s+/g, ' ').trim();
    if (clean === '') {
      setProblem('Name is empty.');
      return;
    }
    setProblem(null);
    add.mutate(
      { projectId, orgId, name: clean, timing },
      {
        onSuccess: (row) => {
          nav.open(row.id, 'forms');
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
      <h1 className="text-base font-semibold text-ink">Add form</h1>
      <TextField label="Name" value={name} onChange={setName} autoFocus maxLength={200} testId="new-form-name" />
      <div role="group" aria-label="When" className="inline-flex w-fit rounded-md border border-line bg-card p-0.5">
        {FORM_TIMINGS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={timing === t}
            data-testid={`new-form-${t}`}
            className={`h-8 rounded px-3 text-sm ${timing === t ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:text-ink'}`}
            onClick={() => {
              setTiming(t);
            }}
          >
            {TIMING_LABELS[t]}
          </button>
        ))}
      </div>
      {problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="primary" icon={Plus} loading={add.isPending} className="w-fit" data-testid="new-form-add">
        Add
      </Button>
    </form>
  );
}
