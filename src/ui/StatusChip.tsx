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
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: `var(--status-${status}-fg)`, background: `var(--status-${status}-bg)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(--status-${status}-dot)` }} />
      {label ?? STATUS[status].label}
    </span>
  );
}
