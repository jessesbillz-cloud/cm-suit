// Settings > Company, the letterhead (0110): the name as printed, address, phone and website, printed beside the logo
// at the top of the PDFs of the jobs that show the company. Saved as I go (on blur) with a version check. Org admins
// only (the card around it already is).
import { useState } from 'react';
import { useOrgLetterhead, useSaveOrgLetterhead } from '../../data/brand';
import type { Letterhead, LetterheadField } from '../../data/brand.types';
import { messageOf } from '../../data/errors';
import { TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { FIELD_ROW } from './SettingRow';

const FIELDS: readonly { field: LetterheadField; label: string; max: number; autoComplete: string }[] = [
  { field: 'print_name', label: 'Name on documents', max: 120, autoComplete: 'organization' },
  { field: 'address', label: 'Address', max: 200, autoComplete: 'street-address' },
  { field: 'phone', label: 'Phone', max: 40, autoComplete: 'tel' },
  { field: 'website', label: 'Website', max: 120, autoComplete: 'url' },
];

function LetterheadFields({ orgId, saved }: { orgId: string; saved: Letterhead }) {
  const save = useSaveOrgLetterhead(orgId);
  const [text, setText] = useState<Record<LetterheadField, string>>({
    print_name: saved.print_name,
    address: saved.address,
    phone: saved.phone,
    website: saved.website,
  });
  return (
    <>
      {FIELDS.map((f) => (
        <TextField
          key={f.field}
          label={f.label}
          value={text[f.field]}
          maxLength={f.max}
          autoComplete={f.autoComplete}
          className={FIELD_ROW}
          testId={`letterhead-${f.field}`}
          onChange={(v) => {
            setText({ ...text, [f.field]: v });
          }}
          onBlur={() => {
            const value = text[f.field].trim();
            if (value !== saved[f.field]) save.mutate({ field: f.field, value });
          }}
        />
      ))}
      {save.isError ? (
        <p role="alert" className="py-1.5 text-sm text-danger">
          {messageOf(save.error)}
        </p>
      ) : null}
    </>
  );
}

export function CompanyLetterhead({ orgId }: { orgId: string }) {
  const letterhead = useOrgLetterhead(orgId);
  if (letterhead.isPending) return <LoadingState label="Loading the letterhead" />;
  if (letterhead.isError) return <ErrorState error={letterhead.error} onRetry={() => void letterhead.refetch()} />;
  // Keyed on the company, not the version: my typing survives each save.
  return (
    <div data-testid="letterhead" data-version={letterhead.data.version} className="flex flex-col">
      <LetterheadFields key={orgId} orgId={orgId} saved={letterhead.data} />
    </div>
  );
}
