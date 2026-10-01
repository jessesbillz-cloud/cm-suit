// The only source of status colors and labels (SPEC §7.1). Chips and calendar marks read from here.
// Hues are MDR's, adjusted for a white background. Amber ROW highlight = impact claimed (lib/status is not used for that).
// fg/bg/dot: the chip (tinted). solid/onSolid: the calendar's filled banners (MDR's month grid): the fill and the text
// on it, dark text on the light fills (pending, postponed, waiting on the GC) as in MDR.

export const STATUS = {
  pending: { label: 'Pending', fg: '#854D0E', bg: '#FEF9C3', dot: '#EAB308', solid: '#FACC15', onSolid: '#422006' },
  confirmed: { label: 'Confirmed', fg: '#166534', bg: '#DCFCE7', dot: '#22C55E', solid: '#16A34A', onSolid: '#FFFFFF' },
  approved: { label: 'Approved', fg: '#166534', bg: '#DCFCE7', dot: '#22C55E', solid: '#16A34A', onSolid: '#FFFFFF' },
  postponed: { label: 'Postponed', fg: '#9A3412', bg: '#FFEDD5', dot: '#F97316', solid: '#FB923C', onSolid: '#431407' },
  not_approved: { label: 'Not approved', fg: '#991B1B', bg: '#FEE2E2', dot: '#EF4444', solid: '#DC2626', onSolid: '#FFFFFF' },
  blocked: { label: 'Blocked', fg: '#991B1B', bg: '#FEE2E2', dot: '#EF4444', solid: '#DC2626', onSolid: '#FFFFFF' },
  cancelled: { label: 'Cancelled', fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF', solid: '#9CA3AF', onSolid: '#111827' },
  assigned: { label: 'Assigned', fg: '#1E40AF', bg: '#DBEAFE', dot: '#3B82F6', solid: '#2563EB', onSolid: '#FFFFFF' },
  // Waiting on the GC before the inspector sees it (MDR's gray "pending_gc"; 0043 ir_status_key).
  gc_review: { label: 'GC review', fg: '#374151', bg: '#F3F4F6', dot: '#9CA3AF', solid: '#B8C0CC', onSolid: '#1F2937' },
  // A routed item's strip (RFI log, Sep 30): a step done (a check on a pale accent tint), the step that has it now
  // (filled in the accent), a step ahead (an empty outline). Answered is `confirmed` (solid green); dot = the edge.
  step_done: { label: 'Done', fg: '#1E40AF', bg: '#EAF1FE', dot: '#C9DAFC', solid: '#2563EB', onSolid: '#FFFFFF' },
  step_current: { label: 'Has it', fg: '#FFFFFF', bg: '#2563EB', dot: '#2563EB', solid: '#2563EB', onSolid: '#FFFFFF' },
  step_ahead: { label: 'Ahead', fg: '#6B7280', bg: '#FFFFFF', dot: '#CDD2DA', solid: '#E5E7EB', onSolid: '#374151' },
  // Past its due date: red text (never amber, which means "impact claimed").
  late: { label: 'Late', fg: '#DC2626', bg: '#FEE2E2', dot: '#EF4444', solid: '#DC2626', onSolid: '#FFFFFF' },
} as const;

export type StatusKey = keyof typeof STATUS;

export function statusLabel(key: StatusKey): string {
  return STATUS[key].label;
}

/** CSS variables for the whole set, injected once at app start. */
export function statusCssVariables(): string {
  return Object.entries(STATUS)
    .flatMap(([k, v]) => [
      `--status-${k}-fg:${v.fg}`,
      `--status-${k}-bg:${v.bg}`,
      `--status-${k}-dot:${v.dot}`,
      `--status-${k}-solid:${v.solid}`,
      `--status-${k}-on-solid:${v.onSolid}`,
    ])
    .join(';');
}
