// The two package fields the new and the existing package forms share: the spec sections picker under its label, and
// the scope text.
import type { CsiLibrary } from '../../data/csi.types';
import { SectionPicker } from './SectionPicker';

const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

interface SpecSectionsFieldProps {
  library: CsiLibrary;
  division: string | null;
  value: readonly string[];
  onChange: (next: string[]) => void;
  busy?: boolean | undefined;
}

export function SpecSectionsField(props: SpecSectionsFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-2">Spec sections</span>
      <SectionPicker {...props} />
    </div>
  );
}

interface PackageScopeFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  rows: number;
}

export function PackageScopeField({ value, onChange, onBlur, rows }: PackageScopeFieldProps) {
  return (
    <label className={LABEL}>
      Scope
      <textarea
        rows={rows}
        data-testid="package-scope"
        className="rounded-md border border-line-strong bg-card px-2.5 py-2 text-sm font-normal text-ink shadow-control outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
        value={value}
        onBlur={onBlur}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
    </label>
  );
}
