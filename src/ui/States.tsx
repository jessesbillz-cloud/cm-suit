// Loading, empty and error look different on every screen (CLAUDE.md rule 6). Three components, used everywhere.
import type { ReactNode } from 'react';
import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react';
import { Icon } from './Icon';
import { Button } from './Button';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 px-4 py-8 text-sm text-ink-2">
      <Icon icon={LoaderCircle} size={16} className="animate-spin" />
      <span>{label}...</span>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  hint?: ReactNode | undefined;
  action?: ReactNode | undefined;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon icon={Inbox} size={22} className="text-ink-3" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-ink-2">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: (() => void) | undefined;
  title?: string | undefined;
}

function errorIdOf(e: unknown): string | null {
  if (e !== null && typeof e === 'object' && 'errorId' in e) {
    const id = (e as { errorId: unknown }).errorId;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/** A red banner with the short message and, for server errors, the error ID support can look up. */
export function ErrorState({ error, onRetry, title = 'This did not load.' }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const id = errorIdOf(error);
  return (
    <div role="alert" className="m-4 flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
      <Icon icon={CircleAlert} size={18} className="mt-0.5 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-danger">{title}</p>
        <p className="text-danger">{message}</p>
        {id ? <p className="mt-1 text-xs text-ink-2">Error ID {id}</p> : null}
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
