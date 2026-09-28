// Dailies setup for me on this job (SPEC §13.1): everything prefilled from the one settings schema; saved as I leave
// each box (version-checked). The start number continues an earlier numbering and is kept by the database.
import { useRef, useState } from 'react';
import { useDailySetup, useNextDailyNumber } from '../../data/dailies.queries';
import { useSaveDailySetup, useSetDailyStartNumber } from '../../data/dailies.mutations';
import type { DailySetupRow } from '../../data/dailies.types';
import { messageOf } from '../../data/errors';
import { useProfile, useProject } from '../../data/queries';
import { buildFilename } from '../../lib/buildFilename';
import { asPdfName, dailyFilenameFields, dailySettingsSchema, parseDailySettings, type DailySettings } from '../../lib/dailies';
import { todayInZone } from '../../lib/dates';
import { CheckField, SelectField, TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { REMINDER_OPTIONS, WEEK_DAYS, parseRecipients } from './model';

const AREA = 'rounded-md border border-line bg-card px-2.5 py-2 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

interface DaysFieldProps {
  days: readonly number[];
  onChange: (days: number[]) => void;
}

function DaysField({ days, onChange }: DaysFieldProps) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-medium text-ink-2">Days</legend>
      <div className="flex gap-1">
        {WEEK_DAYS.map((d) => {
          const on = days.includes(d.day);
          return (
            <button
              key={d.day}
              type="button"
              aria-label={d.name}
              aria-pressed={on}
              className={`h-9 w-9 rounded-md border text-sm ${on ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line text-ink-2'}`}
              onClick={() => {
                onChange(on ? days.filter((x) => x !== d.day) : [...days, d.day]);
              }}
            >
              {d.short}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface FormProps {
  projectId: string;
  row: DailySetupRow | null;
  preview: { project: string; job: string; author: string; company: string; today: string };
  next: number | undefined;
}

function Form({ projectId, row, preview, next }: FormProps) {
  const save = useSaveDailySetup(projectId);
  const start = useSetDailyStartNumber(projectId);
  const [draft, setDraft] = useState<DailySettings>(() => parseDailySettings(row?.settings));
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
      { settings: parsed.data, version: version.current },
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

  let filename: string;
  try {
    filename = asPdfName(
      buildFilename(draft.filename_pattern, {
        number: next ?? 1,
        date: preview.today,
        fields: dailyFilenameFields({
          project_name: preview.project,
          project_number: preview.job,
          project_address: '',
          author_name: preview.author,
          author_company: preview.company,
          label: draft.label,
          timezone: 'UTC',
        }),
      }),
    );
  } catch (e) {
    filename = messageOf(e);
  }

  return (
    <div className="flex flex-col gap-3 p-4" data-testid="daily-setup">
      <TextField label="Name" value={draft.label} onChange={(label) => { change({ label }, false); }} onBlur={commit} />
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
          className="flex-1"
          value={String(draft.reminder_minutes)}
          options={REMINDER_OPTIONS}
          onChange={(v) => { change({ reminder_minutes: Number(v) }, true); }}
        />
      </div>
      <TextField
        label="Filename"
        value={draft.filename_pattern}
        onChange={(filename_pattern) => { change({ filename_pattern }, false); }}
        onBlur={commit}
      />
      <p className="-mt-2 break-all text-xs text-ink-2" data-testid="daily-filename-preview">{filename}</p>
      <label className={`${LABEL} w-32`}>
        Start number
        <input
          type="number"
          min={1}
          inputMode="numeric"
          className="h-9 rounded-md border border-line bg-card px-2.5 text-sm font-normal text-ink outline-none focus:border-accent"
          value={startText ?? (next === undefined ? '' : String(next))}
          onChange={(e) => { setStartText(e.target.value); }}
          onBlur={() => {
            const n = Number(startText);
            if (startText === null || !Number.isInteger(n) || n < 1 || n === next) return;
            start.mutate(n, {
              onSuccess: () => { setStartText(null); },
              onError: (e) => { setProblem(messageOf(e)); },
            });
          }}
        />
      </label>
      <label className={LABEL}>
        Recipients
        <textarea
          rows={3}
          className={AREA}
          value={recipients}
          onChange={(e) => {
            setRecipients(e.target.value);
            change({ recipients: parseRecipients(e.target.value) }, false);
          }}
          onBlur={commit}
        />
      </label>
      <div className="flex items-end gap-3">
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
          rows={3}
          className={AREA}
          value={draft.standing_note}
          maxLength={4000}
          onChange={(e) => { change({ standing_note: e.target.value }, false); }}
          onBlur={commit}
        />
      </label>
      <SaveState pending={save.isPending || start.isPending} saved={save.isSuccess || start.isSuccess} problem={problem} />
    </div>
  );
}

export function SetupForm({ projectId }: { projectId: string }) {
  const setup = useDailySetup(projectId);
  const project = useProject(projectId);
  const profile = useProfile();
  const next = useNextDailyNumber(projectId, true);

  if (setup.isPending || project.isPending || profile.isPending) return <LoadingState label="Loading setup" />;
  if (setup.isError) return <ErrorState error={setup.error} onRetry={() => void setup.refetch()} />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  const preview = {
    project: project.data.name,
    job: project.data.number ?? '',
    author: profile.data.full_name || profile.data.email.split('@')[0] || '',
    company: profile.data.company ?? '',
    today: todayInZone(project.data.timezone),
  };
  // Today's copy makes the setup from the defaults; if it lands after this screen loaded, start over from it.
  return <Form key={setup.data?.id ?? 'new'} projectId={projectId} row={setup.data} preview={preview} next={next.data} />;
}
