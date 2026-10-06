// My profile. Only I can read it (SPEC §5.1); others see name and company through people_display. Saves as I go, as
// Job and Company do (a field when I leave it), each save version-checked. No time zone here: the browser's is
// detected (CLAUDE.md rule 14).
import { useState } from 'react';
import { z } from 'zod';
import { useSaveProfile } from '../../data/mutations';
import { useProfile } from '../../data/queries';
import { messageOf } from '../../data/errors';
import type { ProfilePatch, ProfileRow } from '../../data/types';
import { Card } from '../../ui/Card';
import { TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { ErrorState, LoadingState } from '../../ui/States';
import { CalendarFeedRow } from './CalendarFeedRow';
import { FIELD_ROW, SettingRow } from './SettingRow';

const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter your name.').max(200),
  title: z.string().trim().max(200),
  company: z.string().trim().max(200),
  phone: z.string().trim().max(50),
});

type FieldKey = 'full_name' | 'title' | 'company' | 'phone';

const FIELDS: { key: FieldKey; label: string; type: string; autoComplete: string }[] = [
  { key: 'full_name', label: 'Name', type: 'text', autoComplete: 'name' },
  { key: 'title', label: 'Title', type: 'text', autoComplete: 'organization-title' },
  { key: 'company', label: 'Company', type: 'text', autoComplete: 'organization' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
];

type Form = Record<FieldKey, string>;

interface ProfileFieldsProps {
  profile: ProfileRow;
  onSave: (patch: ProfilePatch) => void;
  onInvalid: (message: string) => void;
}

function ProfileFields({ profile, onSave, onInvalid }: ProfileFieldsProps) {
  const [form, setForm] = useState<Form>({
    full_name: profile.full_name,
    title: profile.title ?? '',
    company: profile.company ?? '',
    phone: profile.phone ?? '',
  });

  /** Saves what changed, as Job and Company do: a field when I leave it. */
  function commit(next: Form) {
    const parsed = profileSchema.safeParse(next);
    if (!parsed.success) {
      onInvalid(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    const v = parsed.data;
    const patch: ProfilePatch = {};
    if (v.full_name !== profile.full_name) patch.full_name = v.full_name;
    if ((v.title || null) !== profile.title) patch.title = v.title || null;
    if ((v.company || null) !== profile.company) patch.company = v.company || null;
    if ((v.phone || null) !== profile.phone) patch.phone = v.phone || null;
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  return (
    <div className="flex flex-col">
      {FIELDS.map((f) => (
        <TextField
          key={f.key}
          label={f.label}
          type={f.type}
          autoComplete={f.autoComplete}
          value={form[f.key]}
          className={FIELD_ROW}
          onChange={(v) => {
            setForm({ ...form, [f.key]: v });
          }}
          onBlur={() => {
            commit(form);
          }}
        />
      ))}
      <SettingRow label="Email">
        <p className="break-all text-sm text-ink-2">{profile.email}</p>
      </SettingRow>
    </div>
  );
}

export function ProfileForm() {
  const profile = useProfile();
  const save = useSaveProfile();
  const [problem, setProblem] = useState<string | null>(null);

  function onSave(patch: ProfilePatch) {
    setProblem(null);
    save.mutate(patch, {
      onError: (e) => {
        setProblem(messageOf(e));
      },
    });
  }

  return (
    <Card title="Profile" actions={<SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />}>
      {profile.isPending ? <LoadingState label="Loading your profile" /> : null}
      {profile.isError ? <ErrorState error={profile.error} onRetry={() => void profile.refetch()} /> : null}
      {profile.data ? <ProfileFields key={profile.data.user_id} profile={profile.data} onSave={onSave} onInvalid={setProblem} /> : null}
      <CalendarFeedRow />
    </Card>
  );
}
