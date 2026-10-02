// Day, time (Flexible or a half-hour slot) and length, for a new request and for Move.
import { SelectField, TextField } from '../../ui/Fields';
import { DURATIONS, TIME_OPTIONS, type WhenPick } from './time';

interface WhenFieldsProps {
  value: WhenPick;
  onChange: (next: WhenPick) => void;
  testId: string;
  /** 48px fields with 16px text (the public request page on a phone). */
  large?: boolean | undefined;
}

export function WhenFields({ value, onChange, testId, large = false }: WhenFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <TextField
        label="Day"
        className="col-span-2 sm:col-span-1"
        type="date"
        value={value.date}
        testId={`${testId}-date`}
        large={large}
        onChange={(date) => {
          onChange({ ...value, date });
        }}
      />
      <SelectField
        label="Time"
        value={value.time}
        options={TIME_OPTIONS}
        testId={`${testId}-time`}
        large={large}
        onChange={(time) => {
          onChange({ ...value, time });
        }}
      />
      <SelectField
        label="Length"
        value={value.duration}
        options={DURATIONS}
        testId={`${testId}-length`}
        large={large}
        onChange={(duration) => {
          onChange({ ...value, duration });
        }}
      />
    </div>
  );
}
