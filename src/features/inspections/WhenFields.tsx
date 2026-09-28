// Day, time (Flexible or a half-hour slot) and length, for a new request and for Move.
import { SelectField, TextField } from '../../ui/Fields';
import { DURATIONS, TIME_OPTIONS, type WhenPick } from './time';

interface WhenFieldsProps {
  value: WhenPick;
  onChange: (next: WhenPick) => void;
  testId: string;
}

export function WhenFields({ value, onChange, testId }: WhenFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TextField
        label="Day"
        type="date"
        value={value.date}
        testId={`${testId}-date`}
        onChange={(date) => {
          onChange({ ...value, date });
        }}
      />
      <SelectField
        label="Time"
        value={value.time}
        options={TIME_OPTIONS}
        testId={`${testId}-time`}
        onChange={(time) => {
          onChange({ ...value, time });
        }}
      />
      <SelectField
        label="Length"
        value={value.duration}
        options={DURATIONS}
        testId={`${testId}-length`}
        onChange={(duration) => {
          onChange({ ...value, duration });
        }}
      />
    </div>
  );
}
