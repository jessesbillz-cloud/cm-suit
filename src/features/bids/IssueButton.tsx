// Issue an addendum (a signed legal record, SPEC §6.9): the edge function numbers, hashes and signs it.
import { useIssueAddendum } from '../../data/bids.mutations';
import type { AddendumRow } from '../../data/bids.types';
import { useToast } from '../../ui/Toast';
import { SignButton } from '../auth/SignButton';

interface IssueButtonProps {
  row: AddendumRow;
  /** While a save is in flight: issue only what is saved. */
  disabled: boolean;
}

export function IssueButton({ row, disabled }: IssueButtonProps) {
  const issue = useIssueAddendum();
  const toast = useToast();
  return (
    <SignButton
      label="Issue"
      testId="addendum-issue"
      pending={issue.isPending}
      disabled={disabled}
      sign={() => issue.mutateAsync(row)}
      onSigned={() => {
        toast.show({ message: `Addendum ${String(row.number)} issued.` });
      }}
    />
  );
}
