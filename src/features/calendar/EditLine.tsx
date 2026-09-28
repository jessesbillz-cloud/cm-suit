// Edit or delete a manual line (calendar.manage). Saves carry the version; Delete sets deleted_at at once and the toast
// offers Undo, which clears it (no "are you sure?").
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useDeleteCalendarLine, useRestoreCalendarLine, useSaveCalendarLine } from '../../data/calendar.mutations';
import type { CalendarLine } from '../../data/calendar.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { draftOf, fieldsOf, type LineDraft } from './draft';
import { LineForm } from './LineForm';
import type { CalendarNav } from './useCalendarNav';

interface EditLineProps {
  line: CalendarLine;
  nav: CalendarNav;
}

export function EditLine({ line, nav }: EditLineProps) {
  const [draft, setDraft] = useState<LineDraft>(() => draftOf(line));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveCalendarLine();
  const del = useDeleteCalendarLine();
  const restore = useRestoreCalendarLine();
  const toast = useToast();

  function submit() {
    const fields = fieldsOf(draft, line.timezone);
    if ('problem' in fields) {
      setProblem(fields.problem);
      return;
    }
    setProblem(null);
    save.mutate(
      { line, fields },
      {
        onSuccess: () => {
          toast.show({ message: 'Saved.' });
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  function remove() {
    setProblem(null);
    void del
      .mutateAsync(line)
      .then((deleted) => {
        nav.closeTo(null);
        toast.show({
          message: 'Line deleted.',
          action: {
            label: 'Undo',
            // mutateAsync: the pane is gone by now, and the undo must still run and report.
            onClick: () => {
              void restore.mutateAsync(deleted).catch((e: unknown) => {
                toast.show({ tone: 'error', message: `Not restored: ${messageOf(e)}` });
              });
            },
          },
        });
      })
      .catch((e: unknown) => {
        setProblem(messageOf(e));
      });
  }

  return (
    <LineForm
      draft={draft}
      onChange={setDraft}
      problem={problem}
      saving={save.isPending}
      canSave
      submitLabel="Save"
      onSubmit={submit}
      extra={
        <Button variant="danger" icon={Trash2} loading={del.isPending} onClick={remove} data-testid="cal-delete">
          Delete
        </Button>
      }
    />
  );
}
