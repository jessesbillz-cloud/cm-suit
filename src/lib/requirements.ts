// Requirements (migration 0069): the kinds, the statuses and how required a line is. The ONE place their values and
// labels live in the app; the database checks the same lists (requirement_kind_ok, the status and required checks) and
// _shared/ai.ts REQUIREMENT_KINDS holds the kinds for the AI's answer.
import type { StatusKey } from './status';

export const REQUIREMENT_KINDS = [
  { value: 'ofci', label: 'OFCI', long: 'Owner furnished, contractor installed' },
  { value: 'ofoi', label: 'OFOI', long: 'Owner furnished, owner installed' },
  { value: 'cfci', label: 'CFCI', long: 'Contractor furnished, contractor installed' },
  { value: 'testing', label: 'Testing', long: 'Testing' },
  { value: 'witness', label: 'Witness', long: 'Witnessed test or inspection' },
  { value: 'mfr_rep', label: "Mfr's rep", long: "Manufacturer's rep" },
  { value: 'warranty', label: 'Warranty', long: 'Special warranty' },
  { value: 'training', label: 'Training', long: 'Owner training' },
  { value: 'attic_stock', label: 'Attic stock', long: 'Attic stock' },
  { value: 'closeout_doc', label: 'Closeout', long: 'Closeout document' },
  { value: 'notice', label: 'Notice', long: 'Notice' },
  { value: 'mockup', label: 'Mockup', long: 'Mockup' },
  { value: 'other', label: 'Other', long: 'Other' },
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number]['value'];
export const KIND_VALUES = REQUIREMENT_KINDS.map((k) => k.value) as [RequirementKind, ...RequirementKind[]];

/** One tap each. Open is no chip lit; done, waived and n/a are finished. Chip colors come from lib/status. */
export const REQUIREMENT_STATUSES = [
  { value: 'open', label: 'Open', chip: 'step_ahead' },
  { value: 'requested', label: 'Requested', chip: 'pending' },
  { value: 'scheduled', label: 'Scheduled', chip: 'assigned' },
  { value: 'done', label: 'Done', chip: 'approved' },
  { value: 'waived', label: 'Waived', chip: 'cancelled' },
  { value: 'na', label: 'N/A', chip: 'cancelled' },
] as const satisfies readonly { value: string; label: string; chip: StatusKey }[];
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]['value'];
export const STATUS_VALUES = REQUIREMENT_STATUSES.map((s) => s.value) as [RequirementStatus, ...RequirementStatus[]];

/** "Not all of it is mandatory, be flexible" (Jesse, Oct 3). */
export const REQUIRED_OPTIONS = [
  { value: 'yes', label: 'Required' },
  { value: 'optional', label: 'Optional' },
  { value: 'if_applicable', label: 'If applicable' },
] as const;
export type RequiredOption = (typeof REQUIRED_OPTIONS)[number]['value'];
export const REQUIRED_VALUES = REQUIRED_OPTIONS.map((r) => r.value) as [RequiredOption, ...RequiredOption[]];

/** The Due view shows what comes due in this many days, and everything late. */
export const DUE_WINDOW_DAYS = 60;

export function kindLabel(kind: RequirementKind): string {
  return REQUIREMENT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function statusOf(status: RequirementStatus): { label: string; chip: StatusKey } {
  const s = REQUIREMENT_STATUSES.find((x) => x.value === status) ?? REQUIREMENT_STATUSES[0];
  return { label: s.label, chip: s.chip };
}

export function requiredLabel(required: RequiredOption): string {
  return REQUIRED_OPTIONS.find((r) => r.value === required)?.label ?? required;
}

/** Still to do (open, requested or scheduled); the rest are finished. */
export function isOpenStatus(status: RequirementStatus): boolean {
  return status === 'open' || status === 'requested' || status === 'scheduled';
}

/** "10 28 00" from what someone typed ("102800" too); the database keeps the same form (requirement_section). */
export function cleanSection(s: string): string {
  const v = s.replace(/\s+/g, ' ').trim();
  return /^\d{6}(\.\d{1,2})?$/.test(v) ? `${v.slice(0, 2)} ${v.slice(2, 4)} ${v.slice(4)}` : v;
}
