// A spec section's 6 digits, typed or picked from the job's spec book sections ("092900 · 09 29 00 Gypsum Board"). Says
// "6 digits" only once something typed is not a section.
import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { specBooksQuery } from '../../data/specs';
import { FIELD_CONTROL } from '../../ui/Fields';
import { hubSections } from './hubItems';
import { typedSection } from './submittalNames';

interface SectionInputProps {
  projectId: string;
  value: string;
  label: string;
  testId: string;
  autoFocus?: boolean | undefined;
  onChange: (value: string) => void;
}

export function SectionInput({ projectId, value, label, testId, autoFocus = false, onChange }: SectionInputProps) {
  const listId = useId();
  const books = useQuery(specBooksQuery(projectId));
  const options = hubSections((books.data ?? []).flatMap((b) => b.sections), []);
  const wrong = value.trim() !== '' && typedSection(value) === null;
  return (
    <span className="flex flex-col gap-1">
      <input
        aria-label={label}
        data-testid={testId}
        list={options.length > 0 ? listId : undefined}
        inputMode="numeric"
        placeholder="092900"
        maxLength={8}
        autoFocus={autoFocus}
        aria-invalid={wrong}
        className={`${FIELD_CONTROL} w-32 tabular-nums ${wrong ? 'border-danger' : ''}`}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      {options.length > 0 ? (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{`${o.section} ${o.title}`}</option>
          ))}
        </datalist>
      ) : null}
      {wrong ? <span className="text-xs text-danger">6 digits</span> : null}
    </span>
  );
}
