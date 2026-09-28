// Delete needs a typed name (kept with the delivery and in the log). The pane then offers Undo (CLAUDE.md rule 16).
import { useState, type FormEvent } from 'react';
import { useDeleteDelivery } from '../../data/deliveries.mutations';
import type { DeliveryRow } from '../../data/deliveries.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';

interface DeleteBoxProps {
  projectId: string;
  row: DeliveryRow;
  onDeleted: () => void;
  onCancel: () => void;
}

export function DeleteBox({ projectId, row, onDeleted, onCancel }: DeleteBoxProps) {
  const [name, setName] = useState('');
  const del = useDeleteDelivery(projectId);
  const toast = useToast();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    del.mutate(
      { row, name: name.trim() },
      {
        onSuccess: onDeleted,
        onError: (err) => {
          toast.show({ tone: 'error', message: `Not deleted: ${messageOf(err)}` });
        },
      },
    );
  };

  return (
    <form className="flex items-end gap-2" onSubmit={submit}>
      <TextField className="min-w-0 flex-1" label="Your name" value={name} autoFocus autoComplete="name" testId="delivery-delete-name" onChange={setName} />
      <Button type="submit" variant="danger" loading={del.isPending} disabled={name.trim() === ''}>
        Delete
      </Button>
      <Button variant="quiet" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
