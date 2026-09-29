// A company form's day (SPEC §8.3; the VIS form's Correction Notices, Observation Letters, IR's, Contractor Activity and
// IOR Notes): the short values in one card, two to a row where they fit, and each long one (IOR Notes) in its own big
// card, starting as the setup's standing note. Field Mode shows only the long ones. The job values are set in Setup.
import { dailyValues, type DailyContent, type ReportForm } from '../../lib/dailies';
import { Section } from './Section';
import { INPUT } from './styles';

const FIELD_LABEL = 'flex flex-col gap-1 text-[13px] font-semibold text-ink';
/** Values allowed longer than this get a whole row. */
const WIDE_AFTER = 100;

interface FormFieldsProps {
  form: ReportForm;
  content: DailyContent;
  locked: boolean;
  /** Field Mode: only the long values, taller. */
  field: boolean;
  onField: (key: string, value: string) => void;
}

export function FormFields({ form, content, locked, field, onField }: FormFieldsProps) {
  const values = dailyValues(form, content.fields, content.standing_note);
  const short = form.daily.filter((f) => !f.multiline);
  const long = form.daily.filter((f) => f.multiline);
  return (
    <>
      {field ? null : (
        <Section title="Daily activity" testId="form-daily">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {short.map((f) => (
              <label key={f.key} className={`${FIELD_LABEL} ${f.max > WIDE_AFTER ? 'sm:col-span-2' : ''}`}>
                {f.label}
                <input
                  className={`h-10 min-w-0 ${INPUT}`}
                  maxLength={f.max}
                  value={values[f.key] ?? ''}
                  disabled={locked}
                  data-testid={`form-field-${f.key}`}
                  onChange={(e) => {
                    onField(f.key, e.target.value);
                  }}
                />
              </label>
            ))}
          </div>
        </Section>
      )}
      {long.map((f) => (
        <Section key={f.key} title={f.label}>
          <textarea
            aria-label={f.label}
            rows={field ? 10 : 16}
            maxLength={f.max}
            className={`w-full resize-y py-2.5 text-[15px] leading-7 ${INPUT}`}
            value={values[f.key] ?? ''}
            disabled={locked}
            data-testid={`form-field-${f.key}`}
            onChange={(e) => {
              onField(f.key, e.target.value);
            }}
          />
        </Section>
      ))}
    </>
  );
}
