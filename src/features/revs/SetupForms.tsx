// Setup's small forms, in place of the row they edit: a list (name, phase, its permit), a rev (number, name), an item
// (name, who does it). Save keeps the form open when the database refuses (the toast says why); Cancel leaves it.
import { useId, useState, type ReactNode } from 'react';
import { usePermitList } from '../../data/permits.queries';
import { useCapability } from '../../data/queries';
import type { Rev, RevList } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { FIELD_CONTROL, FIELD_LABEL, SelectField, TextField } from '../../ui/Fields';
import type { ListValues } from './useSetupActions';

interface EditFormProps {
  children: ReactNode;
  ready: boolean;
  onSave: () => Promise<boolean>;
  onCancel: () => void;
  saveLabel?: string | undefined;
  testId?: string | undefined;
}

export function EditForm({ children, ready, onSave, onCancel, saveLabel = 'Save', testId }: EditFormProps) {
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="my-1 flex flex-col gap-3 rounded-lg border border-line-strong bg-card-head p-3"
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || saving) return;
        setSaving(true);
        void onSave().then((done) => {
          setSaving(false);
          if (done) onCancel();
        });
      }}
    >
      {children}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={!ready} data-testid="rev-form-save">
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}

interface ItemFormProps {
  name?: string | undefined;
  company?: string | null | undefined;
  saveLabel?: string | undefined;
  onSave: (name: string, company: string) => Promise<boolean>;
  onCancel: () => void;
}

export function ItemForm({ name: n0 = '', company: c0, saveLabel, onSave, onCancel }: ItemFormProps) {
  const [name, setName] = useState(n0);
  const [company, setCompany] = useState(c0 ?? '');
  return (
    <EditForm ready={name.trim() !== ''} saveLabel={saveLabel} testId="rev-item-form" onSave={() => onSave(name, company)} onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TextField label="Item" value={name} onChange={setName} autoFocus maxLength={120} testId="rev-item-name" />
        <TextField label="Company" value={company} onChange={setCompany} maxLength={120} testId="rev-item-company" />
      </div>
    </EditForm>
  );
}

interface RevFormProps {
  /** Null: a new rev, its number prefilled with the next one. */
  rev: Rev | null;
  nextNumber?: number | undefined;
  onSave: (number: number, name: string) => Promise<boolean>;
  onCancel: () => void;
}

export function RevForm({ rev, nextNumber = 0, onSave, onCancel }: RevFormProps) {
  const [number, setNumber] = useState(String(rev?.number ?? nextNumber));
  const [name, setName] = useState(rev?.name ?? '');
  const ok = /^\d{1,6}$/.test(number.trim()) && name.trim() !== '';
  return (
    <EditForm ready={ok} saveLabel={rev ? undefined : 'Add'} testId="rev-rev-form" onSave={() => onSave(Number(number.trim()), name)} onCancel={onCancel}>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
        <TextField label="Rev" value={number} onChange={setNumber} type="text" maxLength={6} testId="rev-rev-number" />
        <TextField label="Name" value={name} onChange={setName} autoFocus maxLength={80} testId="rev-rev-name" />
      </div>
    </EditForm>
  );
}

interface PermitSelectProps {
  projectId: string;
  value: string | null;
  onChange: (permitId: string | null) => void;
}

function PermitOptions({ projectId, value, onChange }: PermitSelectProps) {
  const permits = usePermitList(projectId);
  const rows = permits.data ?? [];
  if (rows.length === 0) return null;
  return (
    <SelectField
      label="Permit"
      value={value ?? ''}
      options={[{ value: '', label: 'None' }, ...rows.map((p) => ({ value: p.id, label: `${p.primary_number} · ${p.title}` }))]}
      testId="rev-list-permit"
      onChange={(v) => {
        onChange(v === '' ? null : v);
      }}
    />
  );
}

function PermitName({ projectId, permitId }: { projectId: string; permitId: string }) {
  const permits = usePermitList(projectId);
  const p = permits.data?.find((x) => x.id === permitId);
  return p ? <span data-testid="rev-list-permit-name">{p.primary_number}</span> : null;
}

/** A list's permit number, for those who read permits. */
export function PermitNumber({ projectId, permitId }: { projectId: string; permitId: string }) {
  const read = useCapability(projectId, 'permits.read');
  return read.data === true ? <PermitName projectId={projectId} permitId={permitId} /> : null;
}

/** The job's permits to pick from, for those who read permits; nothing otherwise. */
function PermitSelect(props: PermitSelectProps) {
  const read = useCapability(props.projectId, 'permits.read');
  return read.data === true ? <PermitOptions {...props} /> : null;
}

interface ListFieldsProps {
  projectId: string;
  value: ListValues;
  onChange: (v: ListValues) => void;
}

/** Name, phase and permit: the new-list form and the list's edit share them. */
export function ListFields({ projectId, value, onChange }: ListFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <TextField label="Name" value={value.name} onChange={(name) => { onChange({ ...value, name }); }} maxLength={120} testId="rev-list-name" />
        <TextField label="Phase" value={value.phase} onChange={(phase) => { onChange({ ...value, phase }); }} maxLength={40} testId="rev-list-phase" />
      </div>
      <PermitSelect projectId={projectId} value={value.permitId} onChange={(permitId) => { onChange({ ...value, permitId }); }} />
    </>
  );
}

interface ListFormProps {
  list: RevList;
  onSave: (v: ListValues) => Promise<boolean>;
  onCancel: () => void;
}

export function ListForm({ list, onSave, onCancel }: ListFormProps) {
  const [value, setValue] = useState<ListValues>({ name: list.name, phase: list.phase ?? '', permitId: list.permit_id });
  return (
    <EditForm ready={value.name.trim() !== ''} testId="rev-list-form" onSave={() => onSave(value)} onCancel={onCancel}>
      <ListFields projectId={list.project_id} value={value} onChange={setValue} />
    </EditForm>
  );
}

interface LevelFieldProps {
  value: string;
  /** The list's levels, offered as you type. */
  levels: readonly string[];
  onChange: (level: string) => void;
  autoFocus?: boolean | undefined;
}

/** A wall's level: typed, with the list's levels offered. */
export function LevelField({ value, levels, onChange, autoFocus }: LevelFieldProps) {
  const id = useId();
  return (
    <label className={FIELD_LABEL}>
      Level
      <input
        className={FIELD_CONTROL}
        list={id}
        value={value}
        maxLength={40}
        autoFocus={autoFocus}
        autoComplete="off"
        data-testid="rev-level-input"
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      <datalist id={id}>
        {levels.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </label>
  );
}
