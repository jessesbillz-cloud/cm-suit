// The fields a person types on an item: title, trade, location, description. One set for New and Edit. No number box:
// the CN number comes from the database at Save and is the notice's number. No spec box either: the section goes in
// the description as it is written (Jesse, Oct 5).
import type { CorrectionFields as SavedFields } from '../../data/corrections.types';
import { FIELD_AREA, FIELD_LABEL, TextField } from '../../ui/Fields';

export interface FieldsDraft {
  title: string;
  trade: string;
  location: string;
  description: string;
}

export function draftOf(v: SavedFields): FieldsDraft {
  return {
    title: v.title,
    trade: v.trade,
    location: v.location,
    description: v.description,
  };
}

export function fieldsOf(d: FieldsDraft): SavedFields {
  return {
    title: d.title.trim(),
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
  autoFocus?: boolean | undefined;
}

export function CorrectionFields({ value, onChange, autoFocus }: CorrectionFieldsProps) {
  const set = (patch: Partial<FieldsDraft>) => {
    onChange({ ...value, ...patch });
  };
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
