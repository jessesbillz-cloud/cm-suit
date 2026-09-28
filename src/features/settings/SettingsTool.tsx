// Settings: the job (for people who run it), its RFIs (for those who issue them), my company (if I run it), my profile,
// my layout, calendar subscriptions, notifications, two-step login, and signing out.
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { signOut, useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { RfiSettingsCard } from '../rfis/RfiSettings';
import { CalendarSubscriptions } from './CalendarSubscriptions';
import { CompanySettings } from './CompanySettings';
import { JobSettings } from './JobSettings';
import { LayoutForm } from './LayoutForm';
import { NotifyTree } from './NotifyTree';
import { ProfileForm } from './ProfileForm';
import { TwoStepCard } from './TwoStepCard';

function DeviceCard() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <Card title="This device">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 break-all text-sm text-ink-2">Signed in as {user.email}</p>
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
      {problem ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {problem}
        </p>
      ) : null}
    </Card>
  );
}

export function SettingsTool({ projectId }: { projectId: string | null }) {
  return (
    <div data-testid="settings" className="mx-auto flex max-w-4xl flex-col gap-5 pb-6">
      {projectId ? <JobSettings projectId={projectId} /> : null}
      {projectId ? <RfiSettingsCard projectId={projectId} /> : null}
      <CompanySettings />
      <ProfileForm />
      <LayoutForm />
      <CalendarSubscriptions />
      <NotifyTree />
      <TwoStepCard />
      <DeviceCard />
    </div>
  );
}
