// The kind of a Special inspection, as My Daily Reports lays it out: a button per kind that just says what it is (Soils,
// Concrete, Masonry, Grout ...), one tap picks. Nothing is picked until someone taps one. The member and no-login forms.
import { ChipPick } from '../../ui/ChipPick';

interface SpecialPickProps {
  kinds: readonly { id: string; name: string }[];
  /** The picked kind's id; '' for none. */
  value: string;
  onChange: (id: string) => void;
  testId: string;
}

export function SpecialPick({ kinds, value, onChange, testId }: SpecialPickProps) {
  return (
    <ChipPick
      label="Special inspection"
      chips={kinds.map((k) => ({ value: k.id, label: k.name }))}
      picked={value === '' ? [] : [value]}
      onChange={(picked) => {
        onChange(picked[0] ?? '');
      }}
      testId={testId}
    />
  );
}
