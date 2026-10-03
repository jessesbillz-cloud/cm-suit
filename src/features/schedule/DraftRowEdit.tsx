// One draft row being fixed, in place: name, Activity ID, start and finish, area and trade, milestone. Save (with the
// row's version) or Remove (Undo in the toast). Saving marks the row checked.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useRemoveActivity, useSaveActivity, useScheduleUndo } from '../../data/schedule.mutations';
import type { DraftRow } from '../../data/schedule.types';
import { Button } from '../../ui/Button';
import { CheckField, FIELD_CONTROL, FIELD_LABEL } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';

interface DraftRowEditProps {
  projectId: string;
  row: DraftRow;
  onDone: () => void;
}

export function DraftRowEdit({ projectId, row, onDone }: DraftRowEditProps) {
  const save = useSaveActivity(projectId);
  const remove = useRemoveActivity(projectId);
  const undo = useScheduleUndo(projectId);
  const toast = useToast();
  const [name, setName] = useState(row.name);
  const [code, setCode] = useState(row.activity_code ?? '');
  const [start, setStart] = useState(row.start_date ?? '');
  const [finish, setFinish] = useState(row.finish_date ?? '');
  const [area, setArea] = useState(row.area ?? '');
  const [trade, setTrade] = useState(row.trade ?? '');
  const [milestone, setMilestone] = useState(row.is_milestone);
  const backwards = start !== '' && finish !== '' && finish < start;

  function doSave() {
    save.mutate(
      {
        id: row.id,
        version: row.version,
        input: {
          code, name, wbs: row.wbs ?? '', area, trade, start: start === '' ? null : start,
          finish: milestone ? (start === '' ? null : start) : finish === '' ? null : finish, isMilestone: milestone,
        },
      },
      { onSuccess: onDone },
    );
  }

  async function doRemove() {
    try {
      await remove.mutateAsync(row.id);
    } catch (e) {
      toast.show({ message: messageOf(e), tone: 'error' });
      return;
    }
    onDone();
    toast.show({
      message: 'Row removed.',
      action: {
        label: 'Undo',
        onClick: () => {
          undo.restoreRow(row.id).catch((e: unknown) => {
            toast.show({ message: messageOf(e), tone: 'error' });
          });
        },
      },
    });
  }

  const field = (label: string, value: string, set: (v: string) => void, testId: string, type = 'text') => (
    <label className={FIELD_LABEL}>
      {label}
      <input type={type} className={FIELD_CONTROL} value={value} data-testid={testId} onChange={(e) => { set(e.target.value); }} />
    </label>
  );

  return (
    <li className="flex flex-col gap-3 bg-accent-soft/40 px-4 py-4 shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]" data-testid="schedule-row-edit">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        {field('Activity', name, setName, 'schedule-edit-name')}
        {field('ID', code, setCode, 'schedule-edit-code')}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[10rem_10rem_1fr]">
        {field('Start', start, setStart, 'schedule-edit-start', 'date')}
        {milestone ? null : field('Finish', finish, setFinish, 'schedule-edit-finish', 'date')}
        <div className="col-span-2 flex items-end sm:col-span-1">
          <CheckField label="Milestone" checked={milestone} onChange={setMilestone} testId="schedule-edit-milestone" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('Area', area, setArea, 'schedule-edit-area')}
        {field('Trade', trade, setTrade, 'schedule-edit-trade')}
      </div>
      {backwards ? <p className="text-sm text-danger">The finish is before the start.</p> : null}
      {save.isError ? <p role="alert" className="text-sm text-danger">{messageOf(save.error)}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" loading={save.isPending} disabled={name.trim() === '' || backwards} data-testid="schedule-edit-save" onClick={doSave}>
          Save
        </Button>
        <Button variant="quiet" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="quiet" size="sm" icon={Trash2} className="ml-auto" loading={remove.isPending} data-testid="schedule-edit-remove" onClick={() => void doRemove()}>
          Remove
        </Button>
      </div>
    </li>
  );
}
