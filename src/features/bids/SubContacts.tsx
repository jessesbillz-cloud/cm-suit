// A sub's contacts: name, title, email, phone per person; saved on blur. Removing one saves at once, with Undo.
import { Plus, X } from 'lucide-react';
import type { SubContact } from '../../data/subs.types';
import { Button } from '../../ui/Button';

const INPUT = 'h-8 min-w-0 rounded-md border border-line bg-card px-2 text-sm text-ink outline-none focus:border-accent';
const FIELDS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
] as const;

interface SubContactsProps {
  contacts: readonly SubContact[];
  onChange: (index: number, key: keyof SubContact, value: string) => void;
  onBlur: () => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function SubContacts({ contacts, onChange, onBlur, onAdd, onRemove }: SubContactsProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-ink-2">Contacts</legend>
      {contacts.map((c, i) => (
        // Contacts have no id; the position is the identity while the pane is open.
        <div key={i} className="flex items-start gap-1.5" data-testid="sub-contact">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
            {FIELDS.map((f) => (
              <input
                key={f.key}
                type={f.type}
                aria-label={f.label}
                placeholder={f.label}
                autoComplete="off"
                className={INPUT}
                value={c[f.key]}
                onBlur={onBlur}
                onChange={(e) => {
                  onChange(i, f.key, e.target.value);
                }}
              />
            ))}
          </div>
          <Button
            size="sm"
            variant="quiet"
            icon={X}
            aria-label="Remove contact"
            title="Remove contact"
            onClick={() => {
              onRemove(i);
            }}
          />
        </div>
      ))}
      <Button size="sm" variant="quiet" icon={Plus} className="w-fit" onClick={onAdd}>
        Add contact
      </Button>
    </fieldset>
  );
}
