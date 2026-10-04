// The way out of a dead end (a page that does not exist, a job no longer in the list): one link home.
import { Link } from '@tanstack/react-router';

export function HomeLink() {
  return (
    <Link
      to="/"
      className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-card px-4 text-sm font-medium text-ink shadow-control hover:border-ink-3/60 hover:bg-card-head focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      All my jobs
    </Link>
  );
}
