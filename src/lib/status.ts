// The only source of status colors and labels (SPEC §7.1). Chips and calendar marks read from here.
// Hues are MDR's, adjusted for a white background. Amber ROW highlight = impact claimed (lib/status is not used for that).

export const STATUS = {
  pending: { label: 'Pending', fg: '#854D0E', bg: '#FEF9C3', dot: '#EAB308' },
  confirmed: { label: 'Confirmed', fg: '#166534', bg: '#DCFCE7', dot: '#22C55E' },
  approved: { label: 'Approved', fg: '#166534', bg: '#DCFCE7', dot: '#22C55E' },
  postponed: { label: 'Postponed', fg: '#9A3412', bg: '#FFEDD5', dot: '#F97316' },
  not_approved: { label: 'Not approved', fg: '#991B1B', bg: '#FEE2E2', dot: '#EF4444' },
  blocked: { label: 'Blocked', fg: '#991B1B', bg: '#FEE2E2', dot: '#EF4444' },
  cancelled: { label: 'Cancelled', fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
  assigned: { label: 'Assigned', fg: '#1E40AF', bg: '#DBEAFE', dot: '#3B82F6' },
} as const;

export type StatusKey = keyof typeof STATUS;

export function statusLabel(key: StatusKey): string {
  return STATUS[key].label;
}

/** CSS variables for the whole set, injected once at app start. */
export function statusCssVariables(): string {
  return Object.entries(STATUS)
    .flatMap(([k, v]) => [`--status-${k}-fg:${v.fg}`, `--status-${k}-bg:${v.bg}`, `--status-${k}-dot:${v.dot}`])
    .join(';');
}
