// Form fields with one look: short label above, 40px control (a button's height), accent focus ring. Forms that need
// their own control (a textarea, a time input) take the same classes from here, so every field looks alike.
import type { HTMLInputTypeAttribute } from 'react';

const FOCUS = 'outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-[3px] focus:ring-accent/20';
export const FIELD_CONTROL = `h-10 rounded-lg border border-line-strong bg-card px-3 text-sm font-normal text-ink shadow-control placeholder:text-ink-3 disabled:bg-card-head disabled:text-ink-3 ${FOCUS}`;
export const FIELD_AREA = `rounded-lg border border-line-strong bg-card px-3 py-2 text-sm font-normal leading-6 text-ink shadow-control placeholder:text-ink-3 ${FOCUS}`;
export const FIELD_LABEL = 'flex flex-col gap-1.5 text-[13px] font-medium text-ink-2';
const CONTROL = FIELD_CONTROL;
const LABEL = FIELD_LABEL;
/** Field screens on a phone (the public request page): 48px controls and 16px text, which phones don't zoom into. */
const CONTROL_LARGE = FIELD_CONTROL.replace('h-10', 'h-12').replace('text-sm', 'text-base');
export const FIELD_AREA_LARGE = FIELD_AREA.replace('text-sm', 'text-base');

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Autosaving forms save on blur. */
  onBlur?: (() => void) | undefined;
  type?: HTMLInputTypeAttribute | undefined;
  autoFocus?: boolean | undefined;
  autoComplete?: string | undefined;
  maxLength?: number | undefined;
  testId?: string | undefined;
  className?: string | undefined;
  /** 48px, 16px text (field screens on a phone). */
  large?: boolean | undefined;
}

export function TextField(props: TextFieldProps) {
  const { label, value, onChange, onBlur, type = 'text', autoFocus, autoComplete, maxLength, testId, className = '', large = false } = props;
  return (
    <label className={`${LABEL} ${className}`}>
      {label}
      <input
        type={type}
        className={large ? CONTROL_LARGE : CONTROL}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete ?? 'off'}
        maxLength={maxLength}
        data-testid={testId}
        onBlur={onBlur}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  testId?: string | undefined;
  className?: string | undefined;
  /** 48px, 16px text (field screens on a phone). */
  large?: boolean | undefined;
}

export function SelectField({ label, value, options, onChange, testId, className = '', large = false }: SelectFieldProps) {
  return (
    <label className={`${LABEL} ${className}`}>
      {label}
      <select
        className={large ? CONTROL_LARGE : CONTROL}
        value={value}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface CheckFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
  testId?: string | undefined;
}

export function CheckField({ label, checked, onChange, disabled, testId }: CheckFieldProps) {
  return (
    <label className={`flex min-h-10 items-center gap-2 text-sm ${disabled === true ? 'cursor-not-allowed text-ink-3' : 'cursor-pointer text-ink'}`}>
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-[inherit] accent-accent"
        checked={checked}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}
