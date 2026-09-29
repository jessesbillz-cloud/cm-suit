// The product mark: the name's first letter on the accent square, until there's a real logo (the rail's mark too).
import { FUTURE_NAME } from '../../lib/brand';

const SIZES = {
  /** The layout preview's tiny rail. */
  xs: 'h-4 w-4 rounded-[4px] text-[9px]',
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
