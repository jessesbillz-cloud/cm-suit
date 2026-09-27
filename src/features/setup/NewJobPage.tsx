// "New job" from the job picker: the setup flow on its own page. Cancel goes back to my most recent job.
import { useNavigate } from '@tanstack/react-router';
import { SetupFlow } from './SetupFlow';

export function NewJobPage() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-page">
      <SetupFlow
        onCancel={() => {
          void navigate({ to: '/' });
        }}
      />
    </main>
  );
}
