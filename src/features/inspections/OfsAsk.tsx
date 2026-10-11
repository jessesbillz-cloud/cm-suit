// What an OFS request asks beyond any other (SPEC §18.4 P1; the route is the readiness check, so no box per item): one
// question, "Special inspection required?", nothing preselected, with a notice on Yes (the member form and the no-login
// page); and, when the inspector files the request himself, his one statement (the member form). The notice box is
// every other request's (an OFS one from anyone else states it in the attestation's I confirm).
import { ChoiceRow } from './ChoiceRow';
import { INSPECTOR_STATEMENT, NOTICE_STATEMENT, SPECIAL_NOTICE, SPECIAL_QUESTION } from './model';

const ANSWERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

interface SpecialQuestionProps {
  /** null until answered. */
  value: boolean | null;
  onChange: (required: boolean) => void;
  /** <testId>-yes, <testId>-no, <testId>-notice. */
  testId: string;
}

export function SpecialQuestion({ value, onChange, testId }: SpecialQuestionProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{SPECIAL_QUESTION}</span>
      <ChoiceRow
        label={SPECIAL_QUESTION}
        options={ANSWERS}
        value={value === null ? null : value ? 'yes' : 'no'}
        onPick={(v) => {
          onChange(v === 'yes');
        }}
        testId={testId}
        large
      />
      {value === true ? (
        <p className="text-[13px] text-ink-2" data-testid={`${testId}-notice`}>
          {SPECIAL_NOTICE}
        </p>
      ) : null}
    </div>
  );
}

interface CheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function NoticeBox({ checked, onChange }: CheckProps) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-accent"
        checked={checked}
        data-testid="ir-ack"
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span>{NOTICE_STATEMENT}</span>
    </label>
  );
}

interface InspectorStatementProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function InspectorStatement({ checked, onChange }: InspectorStatementProps) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-accent"
        checked={checked}
        data-testid="ir-inspector-ack"
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span>{INSPECTOR_STATEMENT}</span>
    </label>
  );
}
