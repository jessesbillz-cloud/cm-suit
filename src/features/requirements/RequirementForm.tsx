// Add a requirement by hand, or change one (a draft before keeping it too). One short form: the kind (a button each),
// the title, who, required / optional / if applicable, the section and paragraph, the trigger (what and when, an
// activity ID when there is one) with the notice and lead days, and details. The due date is the database's: the form
// never works it out.
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useSaveRequirement } from '../../data/requirements.mutations';
import type { Requirement } from '../../data/requirements.types';
import { cleanSection, REQUIRED_OPTIONS, REQUIREMENT_KINDS, type RequiredOption, type RequirementKind } from '../../lib/requirements';
import { Button } from '../../ui/Button';
import { ChipPick } from '../../ui/ChipPick';
import { FIELD_AREA, FIELD_LABEL, TextField } from '../../ui/Fields';

interface RequirementFormProps {
  projectId: string;
  /** null: a new one. */
  row: Requirement | null;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

interface Draft {
  kind: RequirementKind | null;
  title: string;
  responsible: string;
  required: RequiredOption;
  section: string;
  ref: string;
  activityName: string;
  activityCode: string;
  triggerDate: string;
  notice: string;
  lead: string;
  details: string;
}

function draftOf(row: Requirement | null): Draft {
  return {
    kind: row?.kind ?? null,
    title: row?.title ?? '',
    responsible: row?.responsible ?? '',
    required: row?.required ?? 'yes',
    section: row?.spec_section ?? '',
    ref: row?.spec_ref ?? '',
    activityName: row?.activity_name ?? '',
    activityCode: row?.activity_code ?? '',
    triggerDate: row?.trigger_date ?? '',
    notice: row?.notice_days === null || row === null ? '' : String(row.notice_days),
    lead: row?.lead_days === null || row === null ? '' : String(row.lead_days),
    details: row?.details ?? '',
  };
}

/** Whole days 0 to 730, or none. */
function daysOf(text: string): number | null | 'bad' {
  const t = text.trim();
  if (t === '') return null;
  return /^\d{1,3}$/.test(t) && Number(t) <= 730 ? Number(t) : 'bad';
}

export function RequirementForm({ projectId, row, onSaved, onCancel }: RequirementFormProps) {
  const save = useSaveRequirement(projectId);
  const [key] = useState(() => crypto.randomUUID());
  const [d, setD] = useState<Draft>(() => draftOf(row));
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
  };
  const notice = daysOf(d.notice);
  const lead = daysOf(d.lead);
  const ready = d.kind !== null && d.title.trim() !== '' && notice !== 'bad' && lead !== 'bad';

  const submit = () => {
    if (d.kind === null || notice === 'bad' || lead === 'bad') return;
    setProblem(null);
    save.mutate(
      {
        id: row?.id ?? null, version: row?.version ?? null, key, kind: d.kind, title: d.title, details: d.details,
        specSection: cleanSection(d.section), specTitle: row?.spec_title ?? '', specRef: d.ref.trim(), responsible: d.responsible.trim(),
        required: d.required, noticeDays: notice, leadDays: lead, activityCode: d.activityCode.trim(), activityName: d.activityName.trim(),
        triggerDate: d.triggerDate === '' ? null : d.triggerDate,
      },
      { onSuccess: (saved) => { onSaved(saved.id); }, onError: (e) => { setProblem(messageOf(e)); } },
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="req-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-2">Kind</span>
        <ChipPick<RequirementKind>
          chips={REQUIREMENT_KINDS.map((k) => ({ value: k.value, label: k.label, title: k.long }))}
          picked={d.kind === null ? [] : [d.kind]}
          label="Kind"
          testId="req-kind"
          onChange={(p) => { set({ kind: p[0] ?? null }); }}
        />
      </div>
      <TextField label="Title" value={d.title} maxLength={200} testId="req-title" onChange={(v) => { set({ title: v }); }} />
      <TextField label="Who" value={d.responsible} maxLength={120} testId="req-who" onChange={(v) => { set({ responsible: v }); }} />
      <ChipPick<RequiredOption>
        chips={REQUIRED_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
        picked={[d.required]}
        label="Required"
        testId="req-required"
        onChange={(p) => { set({ required: p[0] ?? 'yes' }); }}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Section" value={d.section} maxLength={20} testId="req-section" onChange={(v) => { set({ section: v }); }} />
        <TextField label="Paragraph" value={d.ref} maxLength={40} testId="req-ref" onChange={(v) => { set({ ref: v }); }} />
      </div>
      <TextField label="Trigger" value={d.activityName} maxLength={160} testId="req-trigger" onChange={(v) => { set({ activityName: v }); }} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Trigger date" type="date" value={d.triggerDate} testId="req-trigger-date" onChange={(v) => { set({ triggerDate: v }); }} />
        <TextField label="Activity ID" value={d.activityCode} maxLength={40} testId="req-activity" onChange={(v) => { set({ activityCode: v }); }} />
        <TextField label="Notice days" value={d.notice} maxLength={3} testId="req-notice" onChange={(v) => { set({ notice: v }); }} />
        <TextField label="Lead days" value={d.lead} maxLength={3} testId="req-lead" onChange={(v) => { set({ lead: v }); }} />
      </div>
      <label className={FIELD_LABEL}>
        Details
        <textarea
          className={FIELD_AREA}
          rows={3}
          maxLength={2000}
          value={d.details}
          data-testid="req-details"
          onChange={(e) => { set({ details: e.target.value }); }}
        />
      </label>
      {notice === 'bad' || lead === 'bad' ? <p className="text-sm text-danger">Days are whole numbers, 0 to 730.</p> : null}
      {problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!ready} loading={save.isPending} data-testid="req-save" className="max-sm:h-11 max-sm:flex-1">
          Save
        </Button>
        <Button onClick={onCancel} className="max-sm:h-11 max-sm:flex-1">
          Cancel
        </Button>
      </div>
    </form>
  );
}
