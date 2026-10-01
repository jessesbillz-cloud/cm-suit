// The official edits a permit in place: numbers, title, kind, who handles it, the issue and expiry days and
// extensions (up to two), notes. One Save with the version it opened with; Cancel puts it back.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useUpdatePermit } from '../../data/permits.mutations';
import { usePermitPeople } from '../../data/permits.queries';
import type { PermitDetail } from '../../data/permits.types';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_LABEL, SelectField, TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { KINDS, splitNumbers } from './model';

interface PermitEditProps {
  detail: PermitDetail;
  onDone: () => void;
}

const EXTENSIONS = [
  { value: '0', label: 'None' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
];

export function PermitEdit({ detail, onDone }: PermitEditProps) {
  const p = detail.permit;
  const people = usePermitPeople(p.project_id);
  const update = useUpdatePermit();
  const toast = useToast();
  const [number, setNumber] = useState(p.primary_number);
  const [others, setOthers] = useState(p.agency_numbers.join(', '));
  const [title, setTitle] = useState(p.title);
  const [kind, setKind] = useState(p.kind);
  const [assigned, setAssigned] = useState(p.assigned_to ?? '');
  const [issued, setIssued] = useState(p.issued_on ?? '');
  const [expires, setExpires] = useState(p.expires_on ?? '');
  const [extensions, setExtensions] = useState(String(p.extensions));
  const [notes, setNotes] = useState(p.notes);

  const officials = people.data ?? [];
  // Someone assigned before who no longer handles permits still shows, so a save never drops them silently.
  const assignable = officials.some((o) => o.user_id === p.assigned_to) || p.assigned_to === null
    ? officials
    : [...officials, { user_id: p.assigned_to, name: detail.assigned_name ?? 'Someone' }];

  function save() {
    update.mutate(
      {
        ref: p,
        edit: {
          primaryNumber: number, otherNumbers: splitNumbers(others), title, kind, assignedTo: assigned === '' ? null : assigned,
          issuedOn: issued === '' ? null : issued, expiresOn: expires === '' ? null : expires, extensions: Number(extensions), notes,
        },
      },
      {
        onSuccess: () => {
          toast.show({ message: 'Saved.' });
          onDone();
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-line p-3.5"
      data-testid="permit-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Permit number" value={number} onChange={setNumber} maxLength={60} testId="permit-edit-number" />
        <TextField label="Other numbers" value={others} onChange={setOthers} maxLength={300} />
      </div>
      <TextField label="Title" value={title} onChange={setTitle} maxLength={200} testId="permit-edit-title" />
      <SelectField label="Kind" value={kind} options={KINDS} onChange={setKind} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Assigned"
          value={assigned}
          options={[{ value: '', label: 'Nobody yet' }, ...assignable.map((o) => ({ value: o.user_id, label: o.name }))]}
          onChange={setAssigned}
        />
        <SelectField label="Extensions" value={extensions} options={EXTENSIONS} onChange={setExtensions} testId="permit-edit-extensions" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Issued" type="date" value={issued} onChange={setIssued} testId="permit-edit-issued" />
        <TextField label="Expires" type="date" value={expires} onChange={setExpires} testId="permit-edit-expires" />
      </div>
      <label className={FIELD_LABEL}>
        Notes
        <textarea
          rows={2}
          maxLength={4000}
          className={FIELD_AREA}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
      </label>
      {update.isError ? (
        <p role="alert" className="text-sm text-danger">
          {messageOf(update.error)}
        </p>
      ) : null}
      {people.isError ? (
        <p role="alert" className="text-sm text-danger">
          {messageOf(people.error)}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" icon={Check} loading={update.isPending} disabled={number.trim() === '' || title.trim() === ''} data-testid="permit-edit-save">
          Save
        </Button>
      </div>
    </form>
  );
}
