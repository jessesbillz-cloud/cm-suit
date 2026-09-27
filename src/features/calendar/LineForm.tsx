// The fields of a manual line: type, title, date, all day or start-end, location. Short labels, nothing else.
import type { ReactNode } from 'react';
import { CALENDAR_KINDS, MANUAL_KINDS } from '../../lib/calendarKinds';
import { Button } from '../../ui/Button';
import { CheckField, SelectField, TextField } from '../../ui/Fields';
import type { LineDraft } from './draft';

const KIND_OPTIONS = MANUAL_KINDS.map((k) => ({ value: k, label: CALENDAR_KINDS[k].label }));

interface LineFormProps {
  draft: LineDraft;
  onChange: (next: LineDraft) => void;
  /** All my jobs: the job select goes first. */
  jobField?: ReactNode | undefined;
  problem: string | null;
  saving: boolean;
  /** false: the fields show, but Save is off (e.g. no calendar.manage on the picked job). */
  canSave: boolean;
  submitLabel: string;
  onSubmit: () => void;
  /** Next to Save, e.g. Delete. */
  extra?: ReactNode | undefined;
  autoFocusTitle?: boolean | undefined;
}

export function LineForm({ draft, onChange, jobField, problem, saving, canSave, submitLabel, onSubmit, extra, autoFocusTitle }: LineFormProps) {
  const set = (patch: Partial<LineDraft>) => {
    onChange({ ...draft, ...patch });
  };
  return (
    <form
      className="grid gap-3 p-4 sm:grid-cols-2"
      data-testid="cal-line-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {jobField ? <div className="sm:col-span-2">{jobField}</div> : null}
      <TextField
        label="Title"
        value={draft.title}
        autoFocus={autoFocusTitle}
        testId="cal-title"
        className="sm:col-span-2"
        onChange={(title) => {
          set({ title });
        }}
      />
      <SelectField
        label="Type"
        value={draft.kind}
        options={KIND_OPTIONS}
        testId="cal-kind"
        onChange={(kind) => {
          set({ kind });
        }}
      />
      <TextField
        label="Date"
        type="date"
        value={draft.day}
        testId="cal-date"
        onChange={(day) => {
          set({ day });
        }}
      />
      <div className="sm:col-span-2">
        <CheckField
          label="All day"
          checked={draft.allDay}
          onChange={(allDay) => {
            set({ allDay });
          }}
        />
      </div>
      {draft.allDay ? null : (
        <>
          <TextField
            label="Start"
            type="time"
            value={draft.start}
            testId="cal-start"
            onChange={(start) => {
              set({ start });
            }}
          />
          <TextField
            label="End"
            type="time"
            value={draft.end}
            testId="cal-end"
            onChange={(end) => {
              set({ end });
            }}
          />
        </>
      )}
      <TextField
        label="Location"
        value={draft.location}
        className="sm:col-span-2"
        onChange={(location) => {
          set({ location });
        }}
      />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" loading={saving} disabled={!canSave} data-testid="cal-save">
          {submitLabel}
        </Button>
        {extra}
        {problem ? (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}
