// Dailies setup for me on this job (SPEC §13.1, §8.3): the form I write (the work log, the superintendent's or the
// foreman's daily, or a company form; my role's form until I pick one), the schedule,
// the report's name, filename and next number, a company form's job values (typed once, printed on every report) and
// the standing note; everything prefilled. Saved as I leave each box (version-checked). The next number is kept by the
// database, so an earlier numbering carries on. A company's admin also sets up the form's fields here (FormFieldsSetup).
import { useRef, useState } from 'react';
import { useChooseDailyForm, useSaveDailySetup, useSetDailyStartNumber } from '../../data/dailies.mutations';
import { useNextDailyNumber } from '../../data/dailies.queries';
import type { DailySetupRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import { useProfile, useProject } from '../../data/queries';
import type { ProfileRow, ProjectRow } from '../../data/types';
import { buildFilename } from '../../lib/buildFilename';
import {
  FORM_CHOICES,
  asPdfName,
  dailyFilenameFields,
  dailySettingsSchema,
  parseDailySettings,
  type DailySettings,
  type ReportForm,
} from '../../lib/dailies';
import { todayInZone } from '../../lib/dates';
import { ChipPick } from '../../ui/ChipPick';
import { CheckField, SelectField, TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { FormFieldsSetup } from './FormFieldsSetup';
import { REMINDER_OPTIONS, parseRecipients } from './model';
import { Section } from './Section';
import { DaysField, JobFields } from './SetupParts';
import { INPUT, LABEL } from './styles';
import { useDailyForm } from './useDailyForm';

interface FormProps {
  project: ProjectRow;
  profile: ProfileRow;
  reportType: string;
  form: ReportForm | null;
  row: DailySetupRow | null;
  /** A new setup's settings for any form (the one set of defaults, the job's values prefilled). */
  settingsFor: (reportType: string) => DailySettings;
}

function filenamePreview(draft: DailySettings, project: ProjectRow, profile: ProfileRow, next: number | undefined): string {
  try {
    return asPdfName(
      buildFilename(draft.filename_pattern, {
        number: next ?? 1,
        date: todayInZone(project.timezone),
        fields: dailyFilenameFields({
          project_name: project.name,
          project_number: project.number ?? '',
          project_address: '',
          author_name: profile.full_name || profile.email.split('@')[0] || '',
          author_company: profile.company ?? '',
          label: draft.label,
          timezone: 'UTC',
        }),
      }),
    );
  } catch (e) {
    return messageOf(e);
  }
}

function Form({ project, profile, reportType, form, row, settingsFor }: FormProps) {
  const save = useSaveDailySetup(project.id);
  const start = useSetDailyStartNumber(project.id);
  const choose = useChooseDailyForm(project.id);
  const next = useNextDailyNumber(project.id, reportType, true);
  const [draft, setDraft] = useState<DailySettings>(() => parseDailySettings(row?.settings ?? settingsFor(reportType)));
  const [recipients, setRecipients] = useState(() => draft.recipients.join('\n'));
  const [startText, setStartText] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const version = useRef<number | null>(row?.version ?? null);
  // What the server has, so leaving an unchanged box saves nothing.
  const savedJson = useRef(row ? JSON.stringify(parseDailySettings(row.settings)) : '');
  const latest = useRef(draft);
  const busy = useRef(false);
  const again = useRef(false);

  function write() {
    const parsed = dailySettingsSchema.safeParse(latest.current);
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the setup.');
      return;
    }
    setProblem(null);
    const json = JSON.stringify(parsed.data);
    if (json === savedJson.current) return;
    busy.current = true;
    save.mutate(
      { reportType, settings: parsed.data, version: version.current },
      {
        onSuccess: (saved) => {
          version.current = saved.version;
          savedJson.current = json;
        },
        onError: (e) => {
          again.current = false;
          setProblem(messageOf(e));
        },
        onSettled: () => {
          busy.current = false;
          if (again.current) {
            again.current = false;
            write();
          }
        },
      },
    );
  }

  /** Changes the draft; `now` saves at once (toggles, picks), otherwise the box saves when left. */
  function change(patch: Partial<DailySettings>, now: boolean) {
    const updated = { ...latest.current, ...patch };
    latest.current = updated;
    setDraft(updated);
    if (now) commit();
  }

  function commit() {
    if (busy.current) {
      again.current = true;
      return;
    }
    write();
  }

  return (
    <div className="flex min-h-full flex-col bg-page" data-testid="daily-setup">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
        <h2 className="text-base font-semibold text-ink">Setup</h2>
        <SaveState pending={save.isPending || start.isPending || choose.isPending} saved={save.isSuccess || start.isSuccess} problem={problem} />
      </header>
      <div className="flex flex-col gap-3 p-3">
        <Section title="Report">
          <div className="flex flex-col gap-3">
            <div className={LABEL}>
              Form
              <ChipPick
                label="Form"
                chips={FORM_CHOICES}
                picked={[reportType]}
                testId="daily-form"
                onChange={(picked) => {
                  const v = picked[0];
                  if (v === undefined || v === reportType) return;
                  choose.mutate({ reportType: v, settingsIfNew: settingsFor(v) }, { onError: (e) => { setProblem(messageOf(e)); } });
                }}
              />
            </div>
            <TextField label="Name" value={draft.label} onChange={(label) => { change({ label }, false); }} onBlur={commit} />
            <div className="flex flex-col gap-1">
              <TextField
                label="Filename"
                value={draft.filename_pattern}
                onChange={(filename_pattern) => { change({ filename_pattern }, false); }}
                onBlur={commit}
              />
              <p className="break-all text-xs text-ink-2" data-testid="daily-filename-preview">
                {filenamePreview(draft, project, profile, next.data)}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <TextField
                label="Next number"
                type="number"
                className="w-32"
                value={startText ?? (next.data === undefined ? '' : String(next.data))}
                testId="daily-next-number"
                onChange={setStartText}
                onBlur={() => {
                  const n = Number(startText);
                  if (startText === null || !Number.isInteger(n) || n < 1 || n === next.data) return;
                  start.mutate(
                    { reportType, start: n },
                    { onSuccess: () => { setStartText(null); }, onError: (e) => { setProblem(messageOf(e)); } },
                  );
                }}
              />
              <SelectField
                label="Photos per page"
                className="w-36"
                value={String(draft.photos_per_page)}
                options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4' }]}
                onChange={(v) => { change({ photos_per_page: v === '1' ? 1 : v === '4' ? 4 : 2 }, true); }}
              />
              <CheckField label="Signature" checked={draft.signature} onChange={(signature) => { change({ signature }, true); }} />
            </div>
            <label className={LABEL}>
              Standing note
              <textarea
                rows={form ? 4 : 3}
                className={`py-2 ${INPUT}`}
                value={draft.standing_note}
                maxLength={4000}
                data-testid="daily-standing-note"
                onChange={(e) => { change({ standing_note: e.target.value }, false); }}
                onBlur={commit}
              />
            </label>
          </div>
        </Section>
        {form && form.locked.length > 0 ? (
          <Section title="Job info">
            <JobFields
              fields={form.locked}
              values={draft.locked}
              onChange={(key, value) => { change({ locked: { ...latest.current.locked, [key]: value } }, false); }}
              onBlur={commit}
            />
          </Section>
        ) : null}
        {form?.companyFields ? <FormFieldsSetup orgId={project.org_id} formId={reportType} form={form} /> : null}
        <Section title="Schedule">
          <div className="flex flex-col gap-3">
            <DaysField days={draft.schedule_days} onChange={(schedule_days) => { change({ schedule_days }, true); }} />
            <div className="flex gap-3">
              <TextField
                label="Submit by"
                type="time"
                className="w-32"
                value={draft.submit_by}
                onChange={(submit_by) => { change({ submit_by }, false); }}
                onBlur={commit}
              />
              <SelectField
                label="Reminder"
                className="min-w-0 flex-1"
                value={String(draft.reminder_minutes)}
                options={REMINDER_OPTIONS}
                onChange={(v) => { change({ reminder_minutes: Number(v) }, true); }}
              />
            </div>
          </div>
        </Section>
        <Section title="Send to">
          <label className={LABEL}>
            Recipients
            <textarea
              rows={3}
              className={`py-2 ${INPUT}`}
              value={recipients}
              onChange={(e) => {
                setRecipients(e.target.value);
                change({ recipients: parseRecipients(e.target.value) }, false);
              }}
              onBlur={commit}
            />
          </label>
        </Section>
      </div>
    </div>
  );
}

function SetupBody({ project }: { project: ProjectRow }) {
  const f = useDailyForm(project);
  const profile = useProfile();
  if (f.status === 'pending' || profile.isPending) return <LoadingState label="Loading setup" />;
  if (f.status === 'error') return <ErrorState error={f.error} onRetry={f.retry} />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  // A new form, or today's copy making the setup after this screen loaded: start over from the saved setup.
  return (
    <Form
      key={`${f.reportType}:${f.setup?.id ?? 'new'}`}
      project={project}
      profile={profile.data}
      reportType={f.reportType}
      form={f.form}
      row={f.setup}
      settingsFor={f.settingsFor}
    />
  );
}

export function SetupForm({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  if (project.isPending) return <LoadingState label="Loading setup" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  return <SetupBody project={project.data} />;
}
