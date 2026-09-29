// "What's new since you were last in" (SPEC §7.3): one short strip over the lines, accent-tinted when there is
// something new. People can turn it off in Settings.
interface WhatsNewProps {
  count: number;
  /** Formatted last visit, for a single job; null on "All my jobs" or a first visit. */
  since: string | null;
  unreadOnly: boolean;
  onToggle: () => void;
}

export function WhatsNew({ count, since, unreadOnly, onToggle }: WhatsNewProps) {
  const when = since ?? 'you were last in';
  if (count === 0 && !unreadOnly) {
    return <p className="border-b border-line px-4 py-2.5 text-[13px] text-ink-3">Nothing new since {when}</p>;
  }
  return (
    <div className="flex min-h-10 items-center gap-2.5 border-b border-accent/15 bg-accent-soft px-4 py-1 text-[13px] text-ink">
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold tabular-nums">{count} new</span> since {when}
      </p>
      <button
        type="button"
        className="-mr-2 shrink-0 rounded-md px-2 py-1.5 font-medium text-accent hover:bg-accent/10"
        onClick={onToggle}
      >
        {unreadOnly ? 'Show all' : 'Show only these'}
      </button>
    </div>
  );
}
