// Where each missing answer sits on the request form (missing.ts), so a tap on Request can jump to the first one:
// scrolled into view, its first control focused, ringed in red until it is answered.
import type { ReactNode } from 'react';
import { FIELD_MISSING } from '../../ui/Fields';
import type { Missing } from './missing';

interface SpotProps {
  /** The answer(s) this part of the form gives. */
  spot: Missing;
  /** The one a tap on Request jumped to, while still missing. */
  flag: Missing | null;
  children: ReactNode;
}

export function Spot({ spot, flag, children }: SpotProps) {
  return (
    <div data-missing={spot} className={flag === spot ? FIELD_MISSING : undefined}>
      {children}
    </div>
  );
}

/** Scrolls the form to where `missing` is answered and focuses its first control. */
export function jumpTo(form: HTMLFormElement | null, missing: Missing): void {
  const spot = form?.querySelector<HTMLElement>(`[data-missing="${missing}"]`);
  if (!spot) return;
  spot.scrollIntoView({ block: 'center', behavior: 'smooth' });
  spot.querySelector<HTMLElement>('input:not([disabled]):not([type="file"]), textarea, select, button:not([disabled])')?.focus({ preventScroll: true });
}
