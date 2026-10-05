// Delete needs a name (kept with the delivery and in the log; MDR). In the app it is the signed-in person's own, filled
// in (rule 16: prefill what is known) and still changeable. The pane then offers Undo (rule 16).
import { useState, type FormEvent } from 'react';
import { useDeleteDelivery } from '../../data/deliveries.mutations';
import type { DeliveryRow } from '../../data/deliveries.types';
import { messageOf } from '../../data/errors';
import { useProfile } from '../../data/queries';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';

interface DeleteBoxProps {
  projectId: string;
  row: DeliveryRow;
  onDeleted: () => void;
  onCancel: () => void;
}

/** The signed-in person's name, as the database writes it on a post (post_delivery): the full name, else the email's
 *  first part. */
function myName(profile: { full_name: string; email: string } | undefined): string {
  if (!profile) return '';
  const full = profile.full_name.trim();
  return full !== '' ? full : (profile.email.split('@')[0] ?? '');
}

function DeleteForm({ projectId, row, onDeleted, onCancel, initialName }: DeleteBoxProps & { initialName: string }) {
  const [name, setName] = useState(initialName);
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

export function DeleteBox(props: DeleteBoxProps) {
  const profile = useProfile();
  // The form starts once the name is known (a failed lookup leaves it to be typed).
  if (profile.isPending) return null;
  return <DeleteForm {...props} initialName={myName(profile.data)} />;
}
