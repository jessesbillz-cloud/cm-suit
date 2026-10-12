// The fields a person sets on an item: title, To (a company on the job, 0098), trade, location, description. One set
// for New and Edit. No number box: the CN number comes from the database at Save and is the notice's number. No spec
// box either: the section goes in the description as it is written (Jesse, Oct 5).
import type { CorrectionCompany, CorrectionFields as SavedFields } from '../../data/corrections.types';
import { messageOf } from '../../data/errors';
import { FIELD_AREA, FIELD_LABEL, SelectField, TextField } from '../../ui/Fields';

export interface FieldsDraft {
  title: string;
  /** The picked company's id, '' for nobody. */
  to: string;
  trade: string;
  location: string;
  description: string;
}

export function draftOf(v: SavedFields): FieldsDraft {
  return {
    title: v.title,
    to: v.company_org_id ?? '',
    trade: v.trade,
    location: v.location,
    description: v.description,
  };
}

/** The saved fields; `to` is what the picker shows (useToPicker's saved). */
export function fieldsOf(d: FieldsDraft, to: string | null): SavedFields {
  return {
    title: d.title.trim(),
    company_org_id: to,
    trade: d.trade.trim(),
    location: d.location.trim(),
    description: d.description.trim(),
  };
}

const LABEL = FIELD_LABEL;
const AREA = FIELD_AREA;

interface CorrectionFieldsProps {
  value: FieldsDraft;
  onChange: (next: FieldsDraft) => void;
  /** The companies "To" offers (useToPicker), and why they did not load. */
  companies: readonly CorrectionCompany[];
  companiesError: Error | null;
  autoFocus?: boolean | undefined;
}

export function CorrectionFields({ value, onChange, companies, companiesError, autoFocus }: CorrectionFieldsProps) {
  const set = (patch: Partial<FieldsDraft>) => {
    onChange({ ...value, ...patch });
  };
  const to = companies.some((c) => c.org_id === value.to) ? value.to : '';
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Title"
        value={value.title}
        autoFocus={autoFocus}
        testId="cn-title"
        onChange={(title) => {
          set({ title });
        }}
      />
      <SelectField
        label="To"
        value={to}
        testId="cn-to"
        options={[{ value: '', label: 'None' }, ...companies.map((c) => ({ value: c.org_id, label: c.name }))]}
        onChange={(v) => {
          set({ to: v });
        }}
      />
      {companiesError !== null ? <p className="text-sm text-danger">{messageOf(companiesError)}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Trade"
          value={value.trade}
          testId="cn-trade"
          onChange={(trade) => {
            set({ trade });
          }}
        />
        <TextField
          label="Location"
          value={value.location}
          testId="cn-location"
          onChange={(location) => {
            set({ location });
          }}
        />
      </div>
      <label className={LABEL}>
        Description
        <textarea
          rows={3}
          className={AREA}
          value={value.description}
          data-testid="cn-description"
          onChange={(e) => {
            set({ description: e.target.value });
          }}
        />
      </label>
    </div>
  );
}
