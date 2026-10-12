// The checkbox column of a Files list: a row's checkbox and the head's select-all, the same width everywhere so the
// names line up. 40px tall (a thumb's tap on a phone).

export interface RowCheck {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const CHECK = 'flex h-10 w-7 shrink-0 items-center justify-center sm:w-5';

interface CheckBoxProps {
  label: string;
  testId: string;
  check: RowCheck;
}

export function CheckBox({ label, testId, check }: CheckBoxProps) {
  return (
    <label className={`${CHECK} cursor-pointer`}>
      <input
        type="checkbox"
        aria-label={label}
        data-testid={testId}
        className="h-4 w-4 cursor-pointer accent-accent"
        checked={check.checked}
        onChange={(e) => {
          check.onChange(e.target.checked);
        }}
      />
    </label>
  );
}
