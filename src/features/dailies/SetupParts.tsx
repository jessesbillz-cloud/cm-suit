// Pieces of the dailies Setup: the schedule's day toggles, and a company form's job values (typed once, printed on
// every report; SPEC §8.3 "locked project values").
import type { FormField } from '../../lib/dailies';
import { TextField } from '../../ui/Fields';
import { WEEK_DAYS } from './model';
import { INPUT, LABEL } from './styles';

interface DaysFieldProps {
  days: readonly number[];
  onChange: (days: number[]) => void;
}

export function DaysField({ days, onChange }: DaysFieldProps) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-medium text-ink-2">Days</legend>
      <div className="flex gap-1">
        {WEEK_DAYS.map((d) => {
          const on = days.includes(d.day);
          return (
            <button
              key={d.day}
              type="button"
              aria-label={d.name}
              aria-pressed={on}
              className={`h-10 w-10 rounded-md border text-sm sm:h-9 sm:w-9 ${
                on ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line-strong bg-card text-ink-2 shadow-control hover:text-ink'
              }`}
              onClick={() => {
                onChange(on ? days.filter((x) => x !== d.day) : [...days, d.day]);
              }}
            >
              {d.short}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface JobFieldsProps {
  fields: readonly FormField[];
  values: Readonly<Record<string, string>>;
  onChange: (key: string, value: string) => void;
  onBlur: () => void;
}

/** The form's job values, two to a row; a multi-line one (the footer) across the row. */
export function JobFields({ fields, values, onChange, onBlur }: JobFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="daily-job-fields">
      {fields.map((f) =>
        f.multiline ? (
          <label key={f.key} className={`${LABEL} sm:col-span-2`}>
            {f.label}
            <textarea
              rows={2}
              maxLength={f.max}
              className={`py-2 ${INPUT}`}
              value={values[f.key] ?? ''}
              data-testid={`job-field-${f.key}`}
              onChange={(e) => {
                onChange(f.key, e.target.value);
              }}
              onBlur={onBlur}
            />
          </label>
        ) : (
          <TextField
            key={f.key}
            label={f.label}
            maxLength={f.max}
            value={values[f.key] ?? ''}
            testId={`job-field-${f.key}`}
            onChange={(v) => {
              onChange(f.key, v);
            }}
            onBlur={onBlur}
          />
        ),
      )}
    </div>
  );
}
