// Settings rows: the label on the left, its control on the right, a hairline between rows. On a phone the label sits
// above its control. One look for every settings card.
import type { ReactNode } from 'react';

const GRID = 'sm:grid sm:min-h-14 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4 sm:py-2.5';

/** For ui/Fields' TextField and SelectField: their own label becomes the row's label, the control its right side. */
export const FIELD_ROW = `border-b border-line py-3 last:border-b-0 ${GRID} sm:text-sm sm:text-ink sm:[&>input]:max-w-md sm:[&>select]:max-w-md`;

interface SettingRowProps {
  label: string;
  children: ReactNode;
  testId?: string | undefined;
}

/** A row whose control is not a single field: a group of boxes, a switch, a file. */
export function SettingRow({ label, children, testId }: SettingRowProps) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className={`flex flex-col gap-1 border-b border-line py-3 last:border-b-0 ${GRID}`}>
      <span className="text-xs font-medium text-ink-2 sm:text-sm sm:text-ink">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
