// The product mark: the name's first letter on the accent square, until there's a real logo (the rail's mark too).
// In the app's frame the mark is the way home (Jesse, Oct 5): HomeMark, top-left on the desktop rail and the phone bar.
import { Link } from '@tanstack/react-router';
import { FUTURE_NAME } from '../lib/brand';

const SIZES = {
  /** The layout preview's tiny rail. */
  xs: 'h-4 w-4 rounded-[4px] text-[9px]',
  /** The top of the tool rail. */
  md: 'h-9 w-9 rounded-lg text-base',
  /** Sign-in and the public pages. */
  lg: 'h-11 w-11 rounded-xl text-lg',
} as const;

export function BrandMark({ size }: { size: keyof typeof SIZES }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-accent font-bold leading-none text-white shadow-primary ${SIZES[size]}`}
    >
      {FUTURE_NAME.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The mark as the Home button: back to All my jobs ("/", through the router so the base path is kept). */
export function HomeMark() {
  return (
    <Link
      to="/"
      aria-label="Home"
      title="Home"
      data-testid="home"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <BrandMark size="md" />
    </Link>
  );
}
