// Settings: my profile and my layout choices, and signing out. Nothing else lives here in Phase 0.
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { signOut, useUser } from '../../data/auth';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { LayoutForm } from './LayoutForm';
import { ProfileForm } from './ProfileForm';

export function SettingsTool() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <ProfileForm />
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
