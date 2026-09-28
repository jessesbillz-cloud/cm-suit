// The fields a person types on an item: title, trade, location, description, spec tags, notice reference.
// One set for New and Edit.
import type { CorrectionFields as SavedFields } from '../../data/corrections.types';
import { TextField } from '../../ui/Fields';
import { parseTags } from './model';

export interface FieldsDraft {
  title: string;
  trade: string;
  location: string;
  description: string;
  /** Spec tags as typed: "07 84 00, 09 21 16". */
  tags: string;
  noticeRef: string;
}

export function draftOf(v: SavedFields): FieldsDraft {
  return {
    title: v.title,
    trade: v.trade,
    location: v.location,
    description: v.description,
    tags: v.spec_tags.join(', '),
    noticeRef: v.notice_ref,
  };
}

export function fieldsOf(d: FieldsDraft): SavedFields {
  return {
    title: d.title.trim(),
    trade: d.trade.trim(),
    location: d.location.trim(),
    description: d.description.trim(),
    spec_tags: parseTags(d.tags),
    notice_ref: d.noticeRef.trim(),
  };
}

const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';
const AREA = 'rounded-md border border-line px-2.5 py-2 text-sm font-normal text-ink outline-none focus:border-accent';

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
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Spec tags"
          value={value.tags}
          testId="cn-tags"
          onChange={(tags) => {
            set({ tags });
          }}
        />
        <TextField
          label="Notice"
          value={value.noticeRef}
          testId="cn-notice-ref"
          onChange={(noticeRef) => {
            set({ noticeRef });
          }}
        />
      </div>
    </div>
  );
}
