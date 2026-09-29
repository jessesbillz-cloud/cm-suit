// Loading, empty and error look different on every screen (CLAUDE.md rule 6). Three components, used everywhere.
import type { ReactNode } from 'react';
import { CircleAlert, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react';
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
  /** The tool's own icon, so an empty screen still says where you are. */
  icon?: LucideIcon | undefined;
}

export function EmptyState({ title, hint, action, icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon icon={icon} size={22} />
      </span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-ink-2">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: (() => void) | undefined;
  title?: string | undefined;
  /** The banner's outer spacing; replaces the default m-4 (list screens). 'm-0' sits it flush in a card or form. */
  className?: string | undefined;
}

function errorIdOf(e: unknown): string | null {
  if (e !== null && typeof e === 'object' && 'errorId' in e) {
    const id: unknown = e.errorId;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/** A red banner with the short message and, for server errors, the error ID support can look up. */
export function ErrorState({ error, onRetry, title = 'This did not load.', className = 'm-4' }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  const id = errorIdOf(error);
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm ${className}`}>
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
