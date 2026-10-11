// Signed off before the app (0082; Jesse, Oct 5: many Hunter Hall walls had OFS sign-offs on paper, OFS IR #0001 to
// #0068; Oct 10: "I need to be able to go in there and make the changes"). A manager marks an item, or a whole rev, on
// a wall as signed off before, or changes one: a small form (OFS IR #, day, note, each optional) that opens with the
// sign-off being changed, else the number and day last used on the job this session, with the job's OFS IRs by number
// under it (a tap fills the number; the IR of the number given is linked, 0094's rule). Then the items show Done with
// "OFS #0041 · Sep 21". Undo in the toast takes a new one off, or puts a changed one back as it was; Take off (Clear on
// the wall page) takes one off, its Undo puts the same sign-off back, IR and all. Everyone else just sees it done.
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { qk } from '../../data/keys';
import { useOfsFiles } from '../../data/revs.ofsFiles';
import type { OfsFile } from '../../data/revs.types';
import { useClearSignoff, useSetSignoff, type RevSignoff, type SignoffValues } from '../../data/revs.walls';
import { Button } from '../../ui/Button';
import { FIELD_LABEL, TextField } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';
import { EditForm } from './SetupForms';
import { draftOf, fileFor, shortList, valuesOf, type LastSignoff, type SignoffDraft } from './signoffForm';

/** What is being signed off: one item, or a rev's items still to do. */
interface SignTarget {
  itemIds: string[];
  /** "TOW - Speed Plugs", or "Rev 0 · TOW". */
  label: string;
  /** Their live sign-offs: a change's Undo puts these back. None for a new one. */
  was: readonly RevSignoff[];
}

/** The OFS number and day last saved on the job this session (kept in the query cache, gone on reload). */
function useLastSignoff(projectId: string): { last: LastSignoff | null; remember: (v: LastSignoff) => void } {
  const qc = useQueryClient();
  const key = qk.revsPart(projectId, 'last-signoff');
  const q = useQuery<LastSignoff | null>({ queryKey: key, queryFn: () => null, enabled: false, staleTime: Infinity, gcTime: Infinity });
  return {
    last: q.data ?? null,
    remember: (v) => {
      qc.setQueryData(key, v);
    },
  };
}

/** The wall's sign-off moves, each with Undo in the toast. */
function useSignoffActions(projectId: string, areaId: string) {
  const setter = useSetSignoff();
  const clearer = useClearSignoff();
  const { remember } = useLastSignoff(projectId);
  const toast = useToast();
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  // The same sign-offs again, grouped by what they say (a whole rev was one), each with its IR.
  const putBack = (rows: readonly RevSignoff[]) => {
    const groups = new Map<string, { values: SignoffValues; fileId: string | null; itemIds: string[] }>();
    for (const r of rows) {
      const values = { ofsNumber: r.ofs_number, signedOn: r.signed_on, note: r.note };
      const key = JSON.stringify([values, r.file_id]);
      const g = groups.get(key);
      if (g) g.itemIds.push(r.item_id);
      else groups.set(key, { values, fileId: r.file_id, itemIds: [r.item_id] });
    }
    return Promise.all([...groups.values()].map((g) => setter.mutateAsync({ projectId, areaId, itemIds: g.itemIds, fileId: g.fileId, ...g.values })));
  };
  return {
    busy: setter.isPending || clearer.isPending,
    /** Saves; true when saved (the form closes). */
    set: async (target: SignTarget, values: SignoffValues, fileId: string | null): Promise<boolean> => {
      try {
        await setter.mutateAsync({ projectId, areaId, itemIds: target.itemIds, fileId, ...values });
        remember({ ofsNumber: values.ofsNumber, signedOn: values.signedOn });
        const changed = target.was.length > 0;
        toast.show({
          message: changed ? `${target.label}: changed.` : `${target.label}: signed off before.`,
          action: {
            label: 'Undo',
            onClick: () => {
              const undo = changed ? putBack(target.was) : clearer.mutateAsync({ projectId, areaId, itemIds: target.itemIds });
              void undo.catch(failed);
            },
          },
        });
        return true;
      } catch (e) {
        failed(e);
        return false;
      }
    },
    clear: (target: Pick<SignTarget, 'itemIds' | 'label'>) => {
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

interface IrPickProps {
  files: readonly OfsFile[];
  typed: string;
  onPick: (ofs: number) => void;
}

/** The job's OFS IRs by number under the number: a tap fills it; the number's own IR shows picked. */
function IrPick({ files, typed, onPick }: IrPickProps) {
  const list = shortList(files, typed);
  const linked = fileFor(files, typed);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" role="group" aria-label="OFS IR on file" data-testid="rev-before-irs">
      <span className={FIELD_LABEL}>OFS IR on file</span>
      <span className="flex flex-wrap gap-1">
        {list.map((f) => {
          const on = linked?.fileId === f.fileId;
          return (
            <button
              key={f.fileId}
              type="button"
              aria-pressed={on}
              title={f.name}
              data-testid={`rev-before-ir-${String(f.ofs)}`}
              className={`min-h-10 rounded-md border px-3 text-[13px] font-medium tabular-nums sm:min-h-8 ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line-strong bg-card text-ink hover:bg-page'}`}
              onClick={() => {
                onPick(f.ofs);
              }}
            >
              {String(f.ofs).padStart(4, '0')}
            </button>
          );
        })}
      </span>
    </div>
  );
}

interface SignoffFormProps {
  projectId: string;
  target: SignTarget;
  /** What it opens with (signoffForm draftOf). */
  initial: SignoffDraft;
  onSave: (values: SignoffValues, fileId: string | null) => Promise<boolean>;
  onCancel: () => void;
  /** A sign-off being changed: take it off (Undo in the toast). */
  onTakeOff?: (() => void) | undefined;
}

/** OFS IR #, the day and a note, each optional, and the job's OFS IRs by number. */
function SignoffForm({ projectId, target, initial, onSave, onCancel, onTakeOff }: SignoffFormProps) {
  const [draft, setDraft] = useState(initial);
  const ofsFiles = useOfsFiles(projectId, true);
  const files = ofsFiles.data ?? [];
  const values = valuesOf(draft);
  const set = (patch: Partial<SignoffDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };
  return (
    <EditForm
      // The IR of the number is known before Save (the list answers, or fails and Save goes without it).
      ready={values !== null && !ofsFiles.isPending}
      testId="rev-before-form"
      onSave={() => (values === null ? Promise.resolve(false) : onSave(values, fileFor(files, draft.ofs)?.fileId ?? null))}
      onCancel={onCancel}
      extra={
        onTakeOff ? (
          <Button variant="danger" icon={Trash2} data-testid="rev-before-off" onClick={onTakeOff}>
            Take off
          </Button>
        ) : undefined
      }
    >
      <p className="break-words text-[13.5px] font-semibold leading-5 text-ink">{`Signed off before · ${target.label}`}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_10rem_minmax(0,1fr)]">
        <TextField label="OFS IR #" type="number" value={draft.ofs} onChange={(ofs) => { set({ ofs }); }} autoFocus testId="rev-before-ofs" />
        <TextField label="Date" type="date" value={draft.day} onChange={(day) => { set({ day }); }} testId="rev-before-date" />
        <TextField label="Note" value={draft.note} onChange={(note) => { set({ note }); }} maxLength={300} testId="rev-before-note" className="col-span-2 sm:col-span-1" />
      </div>
      <IrPick files={files} typed={draft.ofs} onPick={(ofs) => { set({ ofs: String(ofs) }); }} />
    </EditForm>
  );
}

interface Signing {
  target: SignTarget;
  initial: SignoffDraft;
  /** A sign-off being changed may be taken off from the form. */
  takeOff: boolean;
}

/** A wall's sign-off form, one at a time: a new one (an item, a rev's items) opens with the last number and day used,
 *  a change with its own values. `rows`: the job's live sign-offs (data/revs.history useSignoffs). */
export function useWallSigning(projectId: string, areaId: string, rows: readonly RevSignoff[] | undefined) {
  const [open, setOpen] = useState<Signing | null>(null);
  const actions = useSignoffActions(projectId, areaId);
  const { last } = useLastSignoff(projectId);
  const close = () => {
    setOpen(null);
  };
  const rowOf = (itemId: string) => rows?.find((r) => r.area_id === areaId && r.item_id === itemId) ?? null;
  const form: ReactNode = open ? (
    <SignoffForm
      key={`${open.target.itemIds.join(',')}:${String(open.target.was.length)}`}
      projectId={projectId}
      target={open.target}
      initial={open.initial}
      onSave={(v, fileId) => actions.set(open.target, v, fileId)}
      onCancel={close}
      onTakeOff={
        open.takeOff
          ? () => {
              actions.clear(open.target);
              close();
            }
          : undefined
      }
    />
  ) : null;
  return {
    form,
    /** The item whose form is open (one item only). */
    openItem: open?.target.itemIds.length === 1 ? (open.target.itemIds[0] ?? null) : null,
    sign: (itemIds: string[], label: string) => {
      setOpen({ target: { itemIds, label, was: [] }, initial: draftOf(null, last), takeOff: false });
    },
    /** Change one item's sign-off; `takeOff`: the form offers Take off too. */
    change: (itemId: string, label: string, takeOff = false) => {
      const row = rowOf(itemId);
      if (row) setOpen({ target: { itemIds: [itemId], label, was: [row] }, initial: draftOf(row, null), takeOff });
    },
    clear: (itemId: string, label: string) => {
      actions.clear({ itemIds: [itemId], label });
    },
    close,
  };
}
