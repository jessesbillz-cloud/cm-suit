// The way out of a dead end (a page that does not exist, a job no longer in the list): one link home.
import { Link } from '@tanstack/react-router';
import { CLICK_BOX } from './box';

export function HomeLink() {
  return (
    <Link
      to="/"
      className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-ink ${CLICK_BOX}`}
    >
      All my jobs
    </Link>
  );
}
