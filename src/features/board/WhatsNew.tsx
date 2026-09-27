// "What's new since you were last in" (SPEC §7.3). One line; people can turn it off in Settings.
interface WhatsNewProps {
  count: number;
  /** Formatted last visit, for a single job; null on "All my jobs" or a first visit. */
  since: string | null;
  unreadOnly: boolean;
  onToggle: () => void;
}

export function WhatsNew({ count, since, unreadOnly, onToggle }: WhatsNewProps) {
  const when = since ? ` (${since})` : '';
  if (count === 0 && !unreadOnly) {
    return <p className="border-b border-line px-4 py-2 text-sm text-ink-2">Nothing new since you were last in{when}.</p>;
  }
  return (
    <p className="flex items-center gap-2 border-b border-line bg-accent-soft px-4 py-2 text-sm text-ink">
      <span className="flex-1">
        What&apos;s new since you were last in{when}: {count} {count === 1 ? 'update' : 'updates'}.
      </span>
      <button type="button" className="font-medium text-accent hover:underline" onClick={onToggle}>
        {unreadOnly ? 'Show everything' : 'Show only these'}
      </button>
    </p>
  );
}
