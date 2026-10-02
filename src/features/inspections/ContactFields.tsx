// Who is asking, on the public request page: name, company, phone and/or email. Prefilled from this device (the last
// request sent from it); then "Not you?" empties the boxes and forgets them here.
import type { Contact } from '../../data/requestNoLogin.types';
import { EMPTY_CONTACT, forgetContact } from '../../lib/requestContact';
import { TextField } from '../../ui/Fields';

interface ContactFieldsProps {
  value: Contact;
  onChange: (next: Contact) => void;
  /** The boxes came filled from this device. */
  remembered: boolean;
  onForget: () => void;
}

export function ContactFields({ value, onChange, remembered, onForget }: ContactFieldsProps) {
  const set = (k: keyof Contact) => (v: string) => {
    onChange({ ...value, [k]: v });
  };
  return (
    <div className="flex flex-col gap-3" data-testid="public-contact">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" value={value.name} autoComplete="name" maxLength={120} large testId="public-name" onChange={set('name')} />
        <TextField
          label="Company"
          value={value.company}
          autoComplete="organization"
          maxLength={120}
          large
          testId="public-company"
          onChange={set('company')}
        />
        <TextField label="Phone" type="tel" value={value.phone} autoComplete="tel" maxLength={30} large testId="public-phone" onChange={set('phone')} />
        <TextField
          label="Email"
          type="email"
          value={value.email}
          autoComplete="email"
          maxLength={320}
          large
          testId="public-email"
          onChange={set('email')}
        />
      </div>
      {remembered ? (
        <button
          type="button"
          className="self-start py-1 text-sm font-medium text-accent hover:underline"
          data-testid="public-not-you"
          onClick={() => {
            forgetContact();
            onChange(EMPTY_CONTACT);
            onForget();
          }}
        >
          Not you?
        </button>
      ) : null}
    </div>
  );
}
