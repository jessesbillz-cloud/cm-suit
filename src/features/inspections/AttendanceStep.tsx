// Attendance, shown on the GC's calendar: "Be present" (with the inspector) or "I've got this". Tap again to clear.
import { messageOf } from '../../data/errors';
import { useSetAttendance } from '../../data/inspections.decide';
import type { IrRequest } from '../../data/inspections.types';
import { useToast } from '../../ui/Toast';
import { ChoiceRow } from './ChoiceRow';
import { ATTENDANCE } from './model';

type Attendance = (typeof ATTENDANCE)[number]['value'];

function current(v: string | null): Attendance | null {
  return ATTENDANCE.find((a) => a.value === v)?.value ?? null;
}

export function AttendanceStep({ row }: { row: IrRequest }) {
  const set = useSetAttendance();
  const toast = useToast();
  const value = current(row.attendance);
  return (
    <ChoiceRow
      label="Attendance"
      options={ATTENDANCE}
      value={value}
      disabled={set.isPending}
      testId="ir-attendance"
      onPick={(v) => {
        set.mutate(
          { row, attendance: v === value ? null : v },
          {
            onError: (e) => {
              toast.show({ tone: 'error', message: messageOf(e) });
            },
          },
        );
      }}
    />
  );
}
