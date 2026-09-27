// Settings: the job (for people who run it), my company (if I run it), my profile, two-step login, my layout, and signing out.
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { signOut, useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { CompanySettings } from './CompanySettings';
import { JobSettings } from './JobSettings';
import { LayoutForm } from './LayoutForm';
import { ProfileForm } from './ProfileForm';
import { TwoStepCard } from './TwoStepCard';

export function SettingsTool({ projectId }: { projectId: string | null }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {projectId ? <JobSettings projectId={projectId} /> : null}
      <CompanySettings />
      <ProfileForm />
      <TwoStepCard />
      <LayoutForm />
      <Card title="This device">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-ink-2">Signed in as {user.email}. Signing out clears this device&apos;s copy of your data.</p>
          <Button
            icon={LogOut}
            loading={busy}
            onClick={() => {
              setBusy(true);
              signOut(queryClient)
                .then(() => {
                  // A full reload drops every in-memory trace (upload queue, caches) and lands on sign-in.
                  window.location.assign('/');
                })
                .catch((e: unknown) => {
                  setBusy(false);
                  setProblem(messageOf(e));
                });
            }}
          >
            Sign out
          </Button>
        </div>
        {problem ? <p className="mt-2 text-sm text-danger">{problem}</p> : null}
      </Card>
    </div>
  );
}
