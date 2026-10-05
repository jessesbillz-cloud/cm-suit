// Signed off before the app (0082; Jesse, Oct 5: many Hunter Hall walls had OFS sign-offs on paper, OFS IR #0001 to
// #0068). A manager marks an item, or a whole rev, on a wall as signed off before: a small form (OFS IR #, day, note,
// each optional), then the items show Done with "OFS #0041 · Sep 21". Undo in the toast clears them; Clear on a
// signed-off item takes it back, its Undo puts the same sign-off back. Everyone else just sees it done.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useClearSignoff, useSetSignoff, type RevSignoff, type SignoffValues } from '../../data/revs.walls';
import { TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { EditForm } from './SetupForms';

/** What is being signed off: one item, or a rev's items still to do. */
export interface SignTarget {
  itemIds: string[];
  /** "TOW - Speed Plugs", or "Rev 0 · TOW". */
  label: string;
}

/** The wall's sign-off moves, each with Undo in the toast. */
export function useSignoffActions(projectId: string, areaId: string) {
  const setter = useSetSignoff();
  const clearer = useClearSignoff();
  const toast = useToast();
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  // The same sign-offs again, grouped by what they say (a whole rev was one).
  const putBack = (rows: readonly RevSignoff[]) => {
    const groups = new Map<string, { values: SignoffValues; itemIds: string[] }>();
    for (const r of rows) {
      const values = { ofsNumber: r.ofs_number, signedOn: r.signed_on, note: r.note };
      const key = JSON.stringify(values);
      const g = groups.get(key);
      if (g) g.itemIds.push(r.item_id);
      else groups.set(key, { values, itemIds: [r.item_id] });
    }
    return Promise.all([...groups.values()].map((g) => setter.mutateAsync({ projectId, areaId, itemIds: g.itemIds, ...g.values })));
  };
  return {
    busy: setter.isPending || clearer.isPending,
    /** Saves; true when saved (the form closes). */
    set: async (target: SignTarget, values: SignoffValues): Promise<boolean> => {
      try {
        await setter.mutateAsync({ projectId, areaId, itemIds: target.itemIds, ...values });
        toast.show({
          message: `${target.label}: signed off before.`,
          action: { label: 'Undo', onClick: () => { void clearer.mutateAsync({ projectId, areaId, itemIds: target.itemIds }).catch(failed); } },
        });
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },
    clear: (target: SignTarget) => {
      clearer.mutate(
        { projectId, areaId, itemIds: target.itemIds },
        {
          onSuccess: (rows) => {
            toast.show({
              message: `${target.label}: not signed off.`,
              action: { label: 'Undo', onClick: () => { void putBack(rows).catch(failed); } },
            });
          },
          onError: failed,
        },
      );
    },
  };
}

interface SignoffFormProps {
  target: SignTarget;
  onSave: (values: SignoffValues) => Promise<boolean>;
  onCancel: () => void;
}

/** OFS IR #, the day and a note, each optional. */
export function SignoffForm({ target, onSave, onCancel }: SignoffFormProps) {
  const [ofs, setOfs] = useState('');
  const [day, setDay] = useState('');
  const [note, setNote] = useState('');
  const number = ofs.trim() === '' ? null : Number(ofs.trim());
  const ok = number === null || (Number.isInteger(number) && number > 0);
  return (
    <EditForm
      ready={ok}
      testId="rev-before-form"
      onSave={() => onSave({ ofsNumber: number, signedOn: day === '' ? null : day, note: note.trim() === '' ? null : note.trim() })}
      onCancel={onCancel}
    >
      <p className="break-words text-[13.5px] font-semibold leading-5 text-ink">{`Signed off before · ${target.label}`}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_10rem_minmax(0,1fr)]">
        <TextField label="OFS IR #" type="number" value={ofs} onChange={setOfs} autoFocus testId="rev-before-ofs" />
        <TextField label="Date" type="date" value={day} onChange={setDay} testId="rev-before-date" />
        <TextField label="Note" value={note} onChange={setNote} maxLength={300} testId="rev-before-note" className="col-span-2 sm:col-span-1" />
      </div>
    </EditForm>
  );
}
