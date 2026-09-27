// My profile. Only I can read it (SPEC §5.1); others see name and company through people_display.
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useSaveProfile } from '../../data/mutations';
import { useProfile } from '../../data/queries';
import { messageOf } from '../../data/errors';
import type { ProfileRow } from '../../data/types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';

const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter your name.').max(200),
  title: z.string().trim().max(200),
  company: z.string().trim().max(200),
  phone: z.string().trim().max(50),
  timezone: z.string().min(1),
});

type FieldKey = 'full_name' | 'title' | 'company' | 'phone';

const FIELDS: { key: FieldKey; label: string; type: string; autoComplete: string }[] = [
  { key: 'full_name', label: 'Name', type: 'text', autoComplete: 'name' },
  { key: 'title', label: 'Title', type: 'text', autoComplete: 'organization-title' },
  { key: 'company', label: 'Company', type: 'text', autoComplete: 'organization' },
  { key: 'phone', label: 'Phone', type: 'tel', autoComplete: 'tel' },
];

function ProfileFields({ profile }: { profile: ProfileRow }) {
  const save = useSaveProfile();
  const toast = useToast();
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);
  const [form, setForm] = useState({
    full_name: profile.full_name,
    title: profile.title ?? '',
    company: profile.company ?? '',
    phone: profile.phone ?? '',
    timezone: profile.timezone,
  });
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setProblem(null);
    const v = parsed.data;
    save.mutate(
      {
        patch: {
          full_name: v.full_name,
          title: v.title || null,
          company: v.company || null,
          phone: v.phone || null,
          timezone: v.timezone,
          timezone_set_by_user: v.timezone !== profile.timezone || profile.timezone_set_by_user,
        },
        version: profile.version,
      },
      {
        onSuccess: () => {
          toast.show({ message: 'Profile saved.' });
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {f.label}
          <input
            type={f.type}
            autoComplete={f.autoComplete}
            className="h-9 rounded-md border border-line px-2.5 text-sm font-normal text-ink outline-none focus:border-accent"
            value={form[f.key]}
            onChange={(e) => {
              setForm({ ...form, [f.key]: e.target.value });
            }}
          />
        </label>
      ))}
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
        My time zone
        <select
          className="h-9 rounded-md border border-line bg-card px-2 text-sm font-normal text-ink"
          value={form.timezone}
          onChange={(e) => {
            setForm({ ...form, timezone: e.target.value });
          }}
        >
          {zones.map((z2) => (
            <option key={z2} value={z2}>
              {z2}
            </option>
          ))}
        </select>
      </label>
      <p className="self-end text-xs text-ink-2">Email: {profile.email}</p>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save profile
        </Button>
        {problem ? <p className="text-sm text-danger">{problem}</p> : null}
      </div>
    </form>
  );
}

export function ProfileForm() {
  const profile = useProfile();
  return (
    <Card title="Profile">
      {profile.isPending ? <LoadingState label="Loading your profile" /> : null}
      {profile.isError ? <ErrorState error={profile.error} onRetry={() => void profile.refetch()} /> : null}
      {/* Re-keyed on version: after a save the form starts from what the database now holds. */}
      {profile.data ? <ProfileFields key={profile.data.version} profile={profile.data} /> : null}
    </Card>
  );
}
