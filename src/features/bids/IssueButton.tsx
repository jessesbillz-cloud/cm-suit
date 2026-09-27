// Issue an addendum (a signed legal record, SPEC §6.9): the edge function numbers, hashes and signs it. When it
// answers 403 reauth_required, the email code runs again inline, then the issue is retried once.
import { useState } from 'react';
import { Stamp } from 'lucide-react';
import { sendCode, useUser } from '../../data/auth';
import { useIssueAddendum } from '../../data/bids.mutations';
import type { AddendumRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { CodeForm } from '../auth/CodeForm';

function needsReauth(e: unknown): boolean {
  return e instanceof FunctionError && e.status === 403 && e.error === 'reauth_required';
}

interface IssueButtonProps {
  row: AddendumRow;
  /** While a save is in flight: issue only what is saved. */
  disabled: boolean;
}

export function IssueButton({ row, disabled }: IssueButtonProps) {
  const issue = useIssueAddendum();
  const user = useUser();
  const toast = useToast();
  const [reauth, setReauth] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function run(afterReauth: boolean) {
    setProblem(null);
    issue.mutate(row, {
      onSuccess: () => {
        toast.show({ message: `Addendum ${String(row.number)} issued.` });
      },
      onError: (e) => {
        if (!afterReauth && needsReauth(e)) {
          sendCode(user.email).then(
            () => {
              setReauth(true);
            },
            (err: unknown) => {
              setProblem(messageOf(err));
            },
          );
          return;
        }
        setProblem(messageOf(e));
      },
    });
  }

  if (reauth) {
    return (
      <CodeForm
        email={user.email}
        emailLabel={user.email}
        onVerified={() => {
          setReauth(false);
          run(true);
          return Promise.resolve();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" icon={Stamp} loading={issue.isPending} disabled={disabled} data-testid="addendum-issue" onClick={() => {
          run(false);
        }}
      >
        Issue
      </Button>
      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
    </div>
  );
}
