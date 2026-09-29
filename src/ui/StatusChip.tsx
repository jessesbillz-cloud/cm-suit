// Status chips read their colors from lib/status only (CSS variables injected once at startup).
import { STATUS, type StatusKey } from '../lib/status';

interface StatusChipProps {
  status: StatusKey;
  /** Overrides the default label when the context needs its own word (e.g. "Scanning"). */
  label?: string | undefined;
}

export function StatusChip({ status, label }: StatusChipProps) {
  return (
    <span
      className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none"
      style={{
        color: `var(--status-${status}-fg)`,
        background: `var(--status-${status}-bg)`,
        // A hairline in the chip's own color keeps pale chips from dissolving into white cards.
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--status-${status}-dot) 28%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--status-${status}-dot)` }} />
      {label ?? STATUS[status].label}
    </span>
  );
}
