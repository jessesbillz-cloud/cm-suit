// A form's day (SPEC §8.3, §13.1): the short values in one card (two to a row where they fit; a field with options is
// big tap buttons, e.g. the weather's conditions), then the form's tables (manpower, deliveries, crew ...), then each
// long value (notes, delays, safety) in its own big card; the standing field starts as the setup's standing note. Field
// Mode shows only the long ones. The job values are set in Setup.
import { dailyValues, tablesOf, type DailyContent, type FormField, type ReportForm, type TableRow } from '../../lib/dailies';
import { ChipPick } from '../../ui/ChipPick';
import { FormTableSection } from './FormTable';
import { Section } from './Section';
import { INPUT } from './styles';

const FIELD_LABEL = 'flex flex-col gap-1 text-[13px] font-semibold text-ink';
/** Values allowed longer than this get a whole row. */
const WIDE_AFTER = 100;

/** Its share of the two-column card: a number with a unit (High °F) half even on the phone; a long one the whole row;
 *  others half from the small breakpoint up. */
function spanOf(f: FormField): string {
  if (f.unit) return 'col-span-1';
  return f.max > WIDE_AFTER ? 'col-span-2' : 'col-span-2 sm:col-span-1';
}

/** "Clear, Wind" as the picked buttons, and back. */
function picksOf(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter((s) => s !== '');
}

interface ShortFieldProps {
  field: FormField;
  value: string;
  locked: boolean;
  onField: (key: string, value: string) => void;
}

function ShortField({ field: f, value, locked, onField }: ShortFieldProps) {
  const label = f.unit ? `${f.label} ${f.unit}` : f.label;
  if (f.options) {
    const options = f.options;
    return (
      <div className={`${FIELD_LABEL} col-span-2`}>
        {label}
        {locked ? (
          <p className="text-sm font-normal text-ink-2">{value}</p>
        ) : (
          <ChipPick
            label={label}
            multiple
            chips={options.map((o) => ({ value: o, label: o }))}
            picked={picksOf(value)}
            testId={`form-field-${f.key}`}
            onChange={(picked) => {
              onField(f.key, options.filter((o) => picked.includes(o)).join(', '));
            }}
          />
        )}
      </div>
    );
  }
  return (
    <label className={`${FIELD_LABEL} ${spanOf(f)}`}>
      {label}
      <input
        className={`h-10 min-w-0 ${INPUT}`}
        maxLength={f.max}
        inputMode={f.unit ? 'decimal' : undefined}
        value={value}
        disabled={locked}
        data-testid={`form-field-${f.key}`}
        onChange={(e) => {
          onField(f.key, e.target.value);
        }}
      />
    </label>
  );
}

interface FormFieldsProps {
  form: ReportForm;
  content: DailyContent;
  locked: boolean;
  /** Field Mode: only the long values, taller. */
  field: boolean;
  onField: (key: string, value: string) => void;
  onTable: (key: string, change: (rows: TableRow[]) => TableRow[]) => void;
}

export function FormFields({ form, content, locked, field, onField, onTable }: FormFieldsProps) {
  const values = dailyValues(form, content.fields, content.standing_note);
  const short = form.daily.filter((f) => !f.multiline);
  const long = form.daily.filter((f) => f.multiline);
  return (
    <>
      {field || short.length === 0 ? null : (
        <Section title={form.shortTitle ?? 'Daily activity'} testId="form-daily">
          <div className="grid grid-cols-2 gap-3">
            {short.map((f) => (
              <ShortField key={f.key} field={f} value={values[f.key] ?? ''} locked={locked} onField={onField} />
            ))}
          </div>
        </Section>
      )}
      {field
        ? null
        : tablesOf(form).map((t) => (
            <FormTableSection
              key={t.key}
              table={t}
              rows={content.tables[t.key] ?? []}
              locked={locked}
              onRows={(change) => {
                onTable(t.key, change);
              }}
            />
          ))}
      {long.map((f) => (
        <Section key={f.key} title={f.label}>
          <textarea
            aria-label={f.label}
            rows={field ? 10 : form.tables ? 4 : 16}
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
