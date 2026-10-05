// Inline Rename (a file, or a folder): the name in a field, Save and Cancel. Enter saves, Escape cancels; the field
// starts with the name before its extension selected, so typing replaces just that. The error stays under the field.
import { useEffect, useRef, useState } from 'react';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { FIELD_CONTROL } from '../../ui/Fields';

interface RenameFormProps {
  name: string;
  label: string;
  saving: boolean;
  error: unknown;
  onSave: (name: string) => void;
  onCancel: () => void;
  testId: string;
}

export function RenameForm({ name, label, saving, error, onSave, onCancel, testId }: RenameFormProps) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    const dot = name.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : name.length);
  }, [name]);

  const trimmed = value.trim();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed === '' || trimmed === name) {
          onCancel();
          return;
        }
        onSave(trimmed);
      }}
    >
      <input
        ref={input}
        aria-label={label}
        data-testid={testId}
        className={FIELD_CONTROL}
        value={value}
        maxLength={400}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {error !== null && error !== undefined ? (
        <p role="alert" className="text-xs text-danger">
          {messageOf(error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit" variant="primary" loading={saving} disabled={trimmed === ''}>
          Save
        </Button>
        <Button size="sm" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
