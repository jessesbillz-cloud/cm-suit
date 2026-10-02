// A new permit (the official): the agency's numbers as typed, what it covers, its kind, where it is now (a permit already
// under way starts at its stage), who handles it (prefilled with me) and notes. Short labels, no helper text. Saving
// twice returns the same permit (the form's key).
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { useCreatePermit } from '../../data/permits.mutations';
import { usePermitPeople } from '../../data/permits.queries';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL, SelectField, TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { KINDS, START_STAGES, splitNumbers } from './model';

interface PermitFormProps {
  projectId: string;
  onCreated: (id: string) => void;
}

export function PermitForm({ projectId, onCreated }: PermitFormProps) {
  const user = useUser();
  const people = usePermitPeople(projectId);
  const create = useCreatePermit();
  const toast = useToast();
  const [key] = useState(() => crypto.randomUUID());
  const [number, setNumber] = useState('');
  const [others, setOthers] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<string>('building');
  const [stage, setStage] = useState('draft');
  const [assigned, setAssigned] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const officials = people.data ?? [];
  // Prefill: me, when I handle permits on the job.
  const who = assigned ?? (officials.some((p) => p.user_id === user.id) ? user.id : '');
  const ready = number.trim() !== '' && title.trim() !== '';

  function submit() {
    create.mutate(
      {
        projectId, key, primaryNumber: number, otherNumbers: splitNumbers(others), title, kind, stage,
        assignedTo: who === '' ? null : who, notes,
      },
      {
        onSuccess: (row) => {
          toast.show({ message: `Permit ${row.primary_number} added.` });
          onCreated(row.id);
        },
      },
    );
  }

  return (
    <form
      className="flex min-h-full flex-col"
      data-testid="permit-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em] text-ink">New permit</h1>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Permit number" value={number} onChange={setNumber} autoFocus maxLength={60} testId="permit-number" />
          <TextField label="Other numbers" value={others} onChange={setOthers} maxLength={300} testId="permit-others" />
        </div>
        <TextField label="Title" value={title} onChange={setTitle} maxLength={200} testId="permit-title" />
        <SelectField label="Kind" value={kind} options={KINDS} onChange={setKind} testId="permit-kind" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Stage" value={stage} options={START_STAGES} onChange={setStage} testId="permit-stage" />
          <SelectField
            label="Assigned"
            value={who}
            options={[{ value: '', label: 'Nobody yet' }, ...officials.map((p) => ({ value: p.user_id, label: p.name }))]}
            onChange={(v) => {
              setAssigned(v);
            }}
            testId="permit-assigned"
          />
        </div>
        <label className={FIELD_LABEL}>
          Notes
          <textarea
            rows={3}
            maxLength={4000}
            className={FIELD_AREA}
            value={notes}
            data-testid="permit-notes"
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        </label>
        {create.isError ? (
          <p role="alert" className="text-sm text-danger">
            {messageOf(create.error)}
          </p>
        ) : null}
        {people.isError ? (
          <p role="alert" className="text-sm text-danger">
            {messageOf(people.error)}
          </p>
        ) : null}
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-card px-5 py-3">
        <Button type="submit" variant="primary" icon={Plus} loading={create.isPending} disabled={!ready} data-testid="permit-create">
          Add permit
        </Button>
      </footer>
    </form>
  );
}
