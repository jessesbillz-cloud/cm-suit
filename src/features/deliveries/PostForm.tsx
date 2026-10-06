// The post form (SPEC §13.3): company (the job's list, most-used first; "Other" adds a name), date, time with Time TBD
// under it, duration (not asked when the time is TBD), description. Overlaps are never refused: the heads-up says who is already there and the button says the
// delivery posts as Standby. Controlled; the app and the public link each own the value and the overlap check.
import { useState, type FormEvent, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { DURATIONS, durationLabel } from '../../lib/deliveries';
import type { DeliveryInput } from '../../data/deliveries.types';
import { Button } from '../../ui/Button';
import { CheckField, DateInput, FIELD_CONTROL, FIELD_LABEL, SelectField, TextField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { StandbyChip } from './DeliveryCard';

const OTHER = '__other__';
const CONTROL = FIELD_CONTROL;
const LABEL = FIELD_LABEL;

/** A form value that can be sent: company, description and a time (or TBD). */
function isComplete(v: DeliveryInput): boolean {
  return v.company.trim() !== '' && v.description.trim() !== '' && v.date !== '' && (v.time === null || v.time !== '');
}

interface PostFormProps {
  value: DeliveryInput;
  onChange: (next: DeliveryInput) => void;
  companies: readonly string[];
  /** "Heads up — X already has a delivery 7:00–8:00", or null. */
  headsUp: string | null;
  busy: boolean;
  submitLabel: string;
  onSubmit: () => void;
  /** Extra fields above the company (the typed name on the public link). */
  children?: ReactNode | undefined;
  /** Blocks the button (e.g. the typed name is still empty). */
  blocked?: boolean | undefined;
}

export function PostForm({ value, onChange, companies, headsUp, busy, submitLabel, onSubmit, children, blocked }: PostFormProps) {
  const [other, setOther] = useState(value.company !== '' && !companies.includes(value.company));
  const set = (patch: Partial<DeliveryInput>) => {
    onChange({ ...value, ...patch });
  };
  const options = [
    { value: '', label: 'Pick a company' },
    ...companies.map((c) => ({ value: c, label: c })),
    { value: OTHER, label: 'Other' },
  ];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isComplete(value) && blocked !== true) onSubmit();
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} data-testid="delivery-form">
      {children}
      <SelectField
        label="Company"
        value={other ? OTHER : value.company}
        options={options}
        testId="delivery-company"
        onChange={(v) => {
          setOther(v === OTHER);
          set({ company: v === OTHER ? '' : v });
        }}
      />
      {other ? (
        <TextField label="Company name" value={value.company} autoFocus testId="delivery-company-other" onChange={(v) => {
            set({ company: v });
          }} />
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Date" type="date" value={value.date} testId="delivery-date" onChange={(v) => {
            set({ date: v });
          }} />
        <div className="flex flex-col">
          <label className={LABEL}>
            Time
            <DateInput
              type="time"
              className={CONTROL}
              value={value.time ?? ''}
              disabled={value.time === null}
              data-testid="delivery-time"
              onChange={(e) => {
                set({ time: e.target.value });
              }}
            />
          </label>
          <CheckField label="Time TBD" checked={value.time === null} testId="delivery-tbd" onChange={(tbd) => {
              set({ time: tbd ? null : '' });
            }} />
        </div>
      </div>
      {value.time === null ? null : (
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Duration"
            value={String(value.duration_min)}
            options={DURATIONS.map((m) => ({ value: String(m), label: durationLabel(m) }))}
            testId="delivery-duration"
            onChange={(v) => {
              set({ duration_min: Number(v) });
            }}
          />
        </div>
      )}
      <TextField label="Description" value={value.description} testId="delivery-description" onChange={(v) => {
          set({ description: v });
        }} />
      {headsUp ? (
        <p className="flex items-start gap-2 text-sm text-ink" role="status" data-testid="delivery-heads-up">
          <Icon icon={TriangleAlert} size={16} className="mt-0.5 shrink-0 text-ink-2" />
          <span className="min-w-0 flex-1">{headsUp}</span>
          <StandbyChip />
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={busy} disabled={!isComplete(value) || blocked === true} data-testid="delivery-submit">
        {submitLabel}
      </Button>
    </form>
  );
}
