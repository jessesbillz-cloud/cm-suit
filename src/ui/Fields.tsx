// Form fields with one look: short label above, 36px control, accent focus ring. Used by setup and settings forms.
import type { HTMLInputTypeAttribute } from 'react';

const CONTROL = 'h-9 rounded-md border border-line bg-card px-2.5 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Autosaving forms save on blur. */
  onBlur?: (() => void) | undefined;
  type?: HTMLInputTypeAttribute | undefined;
  autoFocus?: boolean | undefined;
  autoComplete?: string | undefined;
  testId?: string | undefined;
  className?: string | undefined;
}

export function TextField({ label, value, onChange, onBlur, type = 'text', autoFocus, autoComplete, testId, className = '' }: TextFieldProps) {
  return (
    <label className={`${LABEL} ${className}`}>
      {label}
      <input
        type={type}
        className={CONTROL}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete ?? 'off'}
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
}

export function SelectField({ label, value, options, onChange, testId, className = '' }: SelectFieldProps) {
  return (
    <label className={`${LABEL} ${className}`}>
      {label}
      <select
        className={CONTROL}
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
}

export function CheckField({ label, checked, onChange, disabled }: CheckFieldProps) {
  return (
    <label className={`flex h-9 items-center gap-2 text-sm ${disabled === true ? 'text-ink-3' : 'text-ink'}`}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}
