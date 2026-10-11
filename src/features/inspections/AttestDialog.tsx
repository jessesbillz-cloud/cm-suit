// The sub's attestation before an OFS request goes to the GC (0091): the job's wording and one "I confirm". The database
// stamps who, when and the wording on the request. Back closes it, nothing is sent. The member form puts the notice
// under the wording (Jesse, Oct 10: one statement, not two), so the same I confirm states both.
import { Check } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';

interface AttestDialogProps {
  /** The wording; undefined while it loads. */
  text: string | undefined;
  /** The notice, said by the same I confirm. */
  notice?: string | undefined;
  /** Why the wording failed to load (the member form asks for it), or null. */
  error?: unknown;
  onRetry?: (() => void) | undefined;
  sending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export function AttestDialog({ text, notice, error = null, onRetry, sending, onConfirm, onBack }: AttestDialogProps) {
  const ready = text !== undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm"
        data-testid="ir-attest"
        className="flex w-full max-w-md flex-col gap-4 rounded-card bg-card p-5 shadow-pop"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onBack();
        }}
      >
        {ready ? (
          <>
            <p className="whitespace-pre-wrap break-words text-base font-medium leading-7 text-ink" data-testid="ir-attest-text">
              {text}
            </p>
            {notice !== undefined ? (
              <p className="break-words text-base font-medium leading-7 text-ink" data-testid="ir-attest-notice">
                {notice}
              </p>
            ) : null}
          </>
        ) : error !== null ? (
          <ErrorState error={error} onRetry={onRetry} className="m-0" />
        ) : (
          <LoadingState label="Loading" />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onBack} data-testid="ir-attest-back">
            Back
          </Button>
          <Button
            variant="primary"
            icon={Check}
            disabled={!ready}
            loading={sending}
            autoFocus
            onClick={onConfirm}
            data-testid="ir-attest-confirm"
          >
            I confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
