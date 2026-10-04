// "Form fields" in Setup, for the company's admin (SPEC §18.1 principle 10: "each company ticks the fields it wants,
// renames and reorders them, adds its own"): the form in use, laid out as the report is (the short fields, each table
// with its columns, the long fields). Every change saves at once; one of the company's own taken off comes back with
// Undo. Nobody else sees this section; everyone on the job writes on the form it makes.
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useCompanyForms } from '../../data/dailies.queries';
import type { CompanyForms } from '../../data/dailies.types';
import { useOrgAdmin } from '../../data/queries';
import { FORM_SETUP_LIMITS, isAddedKey, tablesOf, type FormSetup, type ReportForm } from '../../lib/dailies';
import { Button } from '../../ui/Button';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { move, putBack, rename, setOn, takeOff, taken, type SetupList } from './formSetup';
import { AddEntry, SetupRow } from './FormSetupParts';
import { Section } from './Section';
import { useFormSetup } from './useFormSetup';

const FIELDS: SetupList = { list: 'fields' };
const TABLES: SetupList = { list: 'tables' };

/** Our names for the form's fields, tables and columns, by where they are. */
function standardNames(form: ReportForm): Map<string, string> {
  const names = new Map<string, string>();
  for (const f of form.daily) names.set(`field-${f.key}`, f.label);
  for (const t of tablesOf(form)) {
    names.set(`table-${t.key}`, t.label);
    for (const c of t.columns) names.set(`column-${t.key}-${c.key}`, c.label);
  }
  return names;
}

function ownCount(entries: readonly { key: string }[]): number {
  return entries.filter((e) => isAddedKey(e.key)).length;
}

interface EditorProps {
  orgId: string;
  formId: string;
  form: ReportForm;
  loaded: CompanyForms;
  onReload: () => void;
}

function Editor({ orgId, formId, form, loaded, onReload }: EditorProps) {
  const draft = useFormSetup({ orgId, formId, form, loaded });
  const toast = useToast();
  const names = standardNames(form);
  const { setup } = draft;
  const disabled = draft.conflict;

  /** One row's props: what it shows and what its controls do. */
  function row(where: SetupList, place: string, entry: FormSetup['fields'][number] | FormSetup['tables'][number]['columns'][number]) {
    const own = isAddedKey(entry.key);
    return {
      testId: `form-setup-${place}`,
      on: entry.on,
      label: entry.label,
      standard: names.get(place) ?? '',
      disabled,
      canUp: move(setup, where, entry.key, -1) !== null,
      canDown: move(setup, where, entry.key, 1) !== null,
      onOn: (on: boolean) => {
        draft.change((s) => setOn(s, where, entry.key, on));
      },
      onRename: (label: string | null) => {
        draft.change((s) => rename(s, where, entry.key, label));
      },
      onMove: (by: -1 | 1) => {
        draft.change((s) => move(s, where, entry.key, by));
      },
      onRemove: own
        ? () => {
            const gone = taken(setup, where, entry.key);
            if (gone === null || !draft.change((s) => takeOff(s, gone))) return;
            toast.show({
              message: gone.list === 'fields' ? 'Field removed.' : 'Column removed.',
              action: {
                label: 'Undo',
                onClick: () => {
                  draft.change((s) => putBack(s, gone));
                },
              },
            });
          }
        : undefined,
    };
  }

  const short = setup.fields.filter((f) => !f.long);
  const long = setup.fields.filter((f) => f.long);
  return (
    <Section
      title="Form fields"
      testId="form-setup"
      actions={
        <>
          <SaveState pending={draft.pending} saved={draft.saved} problem={draft.problem} />
          {draft.conflict ? (
            <Button size="sm" icon={RotateCw} onClick={onReload}>
              Reload
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {short.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {short.map((f) => (
              <SetupRow key={f.key} {...row(FIELDS, `field-${f.key}`, f)} />
            ))}
          </ul>
        ) : null}
        {setup.tables.map((t) => {
          const columns: SetupList = { list: 'columns', table: t.key };
          return (
            <div key={t.key} className="flex flex-col gap-1.5">
              <ul>
                <SetupRow {...row(TABLES, `table-${t.key}`, t)} strong />
              </ul>
              <ul className="ml-6 flex flex-col gap-1.5">
                {t.columns.map((c) => (
                  <SetupRow key={c.key} {...row(columns, `column-${t.key}-${c.key}`, c)} />
                ))}
              </ul>
              {ownCount(t.columns) < FORM_SETUP_LIMITS.addedColumns ? (
                <div className="ml-6 flex flex-col">
                  <AddEntry
                    label="Add column"
                    kinds={false}
                    disabled={disabled || draft.pending}
                    testId={`form-setup-add-column-${t.key}`}
                    onAdd={(name, _long, done) => {
                      draft.addField(name, false, t.key, done);
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        {long.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {long.map((f) => (
              <SetupRow key={f.key} {...row(FIELDS, `field-${f.key}`, f)} />
            ))}
          </ul>
        ) : null}
        {ownCount(setup.fields) < FORM_SETUP_LIMITS.addedFields ? (
          <AddEntry
            label="Add field"
            kinds
            disabled={disabled || draft.pending}
            testId="form-setup-add-field"
            onAdd={(name, isLong, done) => {
              draft.addField(name, isLong, null, done);
            }}
          />
        ) : null}
      </div>
    </Section>
  );
}

interface FormFieldsSetupProps {
  orgId: string;
  /** The form in use (its report type) and the built-in form. */
  formId: string;
  form: ReportForm;
}

export function FormFieldsSetup({ orgId, formId, form }: FormFieldsSetupProps) {
  const admin = useOrgAdmin(orgId);
  const forms = useCompanyForms(admin.data === true ? orgId : undefined);
  // Bumped by Reload after a conflict: the rows start over from the saved setup.
  const [generation, setGeneration] = useState(0);
  if (admin.isError) return <ErrorState error={admin.error} onRetry={() => void admin.refetch()} className="" />;
  if (admin.data !== true) return null;
  if (forms.isError) return <ErrorState error={forms.error} onRetry={() => void forms.refetch()} className="" />;
  if (forms.isPending) return <LoadingState label="Loading form fields" />;
  return (
    <Editor
      key={`${formId}:${String(generation)}`}
      orgId={orgId}
      formId={formId}
      form={form}
      loaded={forms.data}
      onReload={() => {
        void forms.refetch().then(() => {
          setGeneration((g) => g + 1);
        });
      }}
    />
  );
}
