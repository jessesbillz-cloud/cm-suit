// Synthetic Requirements fixtures for the e2e mock (migrations 0069, 0073), dated from today on Sample Job A's clock:
// the owner-furnished restroom accessories (notify the owner 60 days before restroom finishes), the fire alarm
// acceptance test (witnessed), the roofing manufacturer's field rep (if applicable), the 2-year roofing special warranty
// (Sample Roofing's line), owner training with 14 days' notice, a utility shutdown notice that is late, extra ceiling
// tile already delivered, two lines of Sample Drywall (the mock sub's company) and three AI drafts from the toilet
// accessories section. Plus the companies on the job, the spec books' sections and what a read of a section finds.
import { addDays, format, parseISO } from 'date-fns';
import type { RequiredOption, RequirementKind, RequirementStatus } from '../../lib/requirements';
import type { Requirement, RequirementCompany, SpecSection } from '../requirements.types';

export const TZ = 'America/Los_Angeles';
export const SPEC_FILE = 'mock-spec-book-2';
const SPEC_NAME = 'Sample Spec Book Vol 2.pdf';

/** The companies on Sample Job A (requirement_companies), by name. */
const COMPANIES: RequirementCompany[] = [
  { org_id: 'mock-org-builders', name: 'Sample Builders' },
  { org_id: 'mock-org-drywall', name: 'Sample Drywall' },
  { org_id: 'mock-org-roofing', name: 'Sample Roofing' },
];

export function jobCompanies(projectId: string): RequirementCompany[] {
  return projectId === 'job-a' ? COMPANIES : [];
}

/** The company of the mock user's membership on the job, by role: the sub and the foreman are Sample Drywall's. */
export const MEMBER_COMPANY: Readonly<Record<string, string>> = { sub: 'mock-org-drywall', foreman: 'mock-org-drywall' };

/** A line as the mock keeps it: the list's fields (days_left and mine are worked out when read) and its job. */
export interface StoredRequirement extends Omit<Requirement, 'days_left' | 'due_on' | 'mine'> {
  project_id: string;
  deleted: boolean;
  key: string | null;
  /** The mock user who attached the evidence file (files.created_by). */
  evidence_file_by: string | null;
}

function plusDays(day: string, n: number): string {
  return format(addDays(parseISO(day), n), 'yyyy-MM-dd');
}

/** trigger date - notice - lead, as the database sets it. */
export function dueOf(r: Pick<StoredRequirement, 'trigger_date' | 'notice_days' | 'lead_days'>): string | null {
  return r.trigger_date === null ? null : plusDays(r.trigger_date, -((r.notice_days ?? 0) + (r.lead_days ?? 0)));
}

interface SeedLine {
  id: string;
  kind: RequirementKind;
  title: string;
  section: [string, string, string];
  responsible: string;
  /** The company on the job the line belongs to. */
  company?: string;
  required?: RequiredOption;
  notice?: number;
  lead?: number;
  activity?: [string, string];
  /** Trigger date, in days from today. */
  trigger?: number;
  status?: RequirementStatus;
  details?: string;
  evidence?: string;
  draft?: { quote: string; page: number };
}

const SEEDS: SeedLine[] = [
  { id: 'mock-req-ofci', kind: 'ofci', title: 'Restroom accessories', section: ['10 28 00', 'Toilet Accessories', '1.3.A'],
    responsible: 'Owner', notice: 60, activity: ['A2310', 'Restroom finishes start'], trigger: 64,
    details: 'Paper towel, toilet tissue and soap dispensers.' },
  { id: 'mock-req-witness', kind: 'witness', title: 'Fire alarm acceptance test', section: ['28 46 21.11', 'Addressable Fire-Alarm Systems', '3.4.A'],
    responsible: 'Electrical sub', notice: 10, activity: ['A4120', 'Fire alarm acceptance test'], trigger: 15, status: 'requested',
    details: 'Witnessed by the Inspector of Record and the Fire Marshal.' },
  { id: 'mock-req-rep', kind: 'mfr_rep', title: "Roofing manufacturer's field rep", section: ['07 54 23', 'Thermoplastic Polyolefin Roofing', '3.2.B'],
    responsible: 'Roofing sub', required: 'if_applicable', lead: 14, activity: ['A3050', 'Roofing complete'], trigger: 30,
    details: 'A visit, or photos the manufacturer accepts.' },
  { id: 'mock-req-warranty', kind: 'warranty', title: 'Roofing special warranty (2 years)', section: ['07 54 23', 'Thermoplastic Polyolefin Roofing', '1.8.A'],
    responsible: 'Sample Roofing', company: 'mock-org-roofing', activity: ['', 'Substantial completion'], trigger: 120 },
  { id: 'mock-req-training', kind: 'training', title: 'Owner training: HVAC controls', section: ['23 09 00', 'Instrumentation and Control for HVAC', '3.5.A'],
    responsible: 'Mechanical sub', notice: 14, activity: ['', 'Training'], trigger: 50, details: 'Four hours, maintenance staff.' },
  { id: 'mock-req-shutdown', kind: 'notice', title: 'Utility shutdown notice: domestic water', section: ['01 14 00', 'Work Restrictions', '1.4.B'],
    responsible: 'GC', notice: 14, activity: ['A1200', 'Domestic water tie-in'], trigger: 11 },
  { id: 'mock-req-tile', kind: 'attic_stock', title: 'Extra ceiling tile (2%)', section: ['09 51 13', 'Acoustical Panel Ceilings', '1.6.A'],
    responsible: 'Ceiling sub', trigger: -10, status: 'done', evidence: 'Delivered to the custodian; signed receipt.' },
  { id: 'mock-req-gyp-stock', kind: 'attic_stock', title: 'Extra gypsum board (1%)', section: ['09 29 00', 'Gypsum Board', '1.6.A'],
    responsible: 'Sample Drywall', company: 'mock-org-drywall', activity: ['', 'Substantial completion'], trigger: 40,
    details: 'Full sheets, each type installed, delivered to the Owner.' },
  { id: 'mock-req-gyp-mockup', kind: 'mockup', title: 'Level 4 finish mockup', section: ['09 29 00', 'Gypsum Board', '1.7.B'],
    responsible: 'Sample Drywall', company: 'mock-org-drywall', activity: ['', 'Gypsum board finishing starts'], trigger: 100 },
  { id: 'mock-req-draft-keys', kind: 'attic_stock', title: 'Spare accessory lock keys', section: ['10 28 00', 'Toilet Accessories', '1.4.A'],
    responsible: '', draft: { page: 403, quote: 'Furnish extra materials: two (2) spare keys for each type of accessory lock, delivered to the Owner.' } },
  { id: 'mock-req-draft-mirror', kind: 'warranty', title: 'Mirror special warranty (10 years)', section: ['10 28 00', 'Toilet Accessories', '1.5.A'],
    responsible: 'Manufacturer', activity: ['', 'Substantial Completion'],
    draft: { page: 403, quote: 'Special Warranty: Manufacturer agrees to repair or replace mirrors that develop silver spoilage within 10 years from date of Substantial Completion.' } },
  { id: 'mock-req-draft-mockup', kind: 'mockup', title: 'Accessible stall mockup', section: ['10 28 00', 'Toilet Accessories', '3.1.B'],
    responsible: '', activity: ['', 'Installation'],
    draft: { page: 405, quote: "Mock-up: Install one complete accessible stall for the Architect's approval before installing the rest." } },
];

export function line(over: Partial<StoredRequirement> & Pick<StoredRequirement, 'id' | 'kind' | 'title' | 'project_id'>): StoredRequirement {
  return {
    version: 1, details: '', spec_section: '', spec_title: '', spec_ref: '', responsible: '', required: 'yes', notice_days: null,
    lead_days: null, activity_code: '', activity_name: '', trigger_date: null, status: 'open', status_at: null, evidence_note: '',
    evidence_file_id: null, evidence_file_name: null, origin: 'hand', draft: false, source_file_id: null, source_file_name: null,
    source_page: null, source_quote: '', created_at: '2026-10-01T15:00:00.000Z', company_org_id: null, deleted: false, key: null,
    evidence_file_by: null,
    ...over,
  };
}

export function seedRequirements(today: string): StoredRequirement[] {
  return SEEDS.map((s) =>
    line({
      id: s.id, project_id: 'job-a', kind: s.kind, title: s.title, details: s.details ?? '', spec_section: s.section[0],
      spec_title: s.section[1], spec_ref: s.section[2], responsible: s.responsible, company_org_id: s.company ?? null,
      required: s.required ?? 'yes',
      notice_days: s.notice ?? null, lead_days: s.lead ?? null, activity_code: s.activity?.[0] ?? '', activity_name: s.activity?.[1] ?? '',
      trigger_date: s.trigger === undefined ? null : plusDays(today, s.trigger), status: s.status ?? 'open',
      evidence_note: s.evidence ?? '', origin: s.draft ? 'ai' : 'hand', draft: s.draft !== undefined,
      source_file_id: s.draft ? SPEC_FILE : null, source_file_name: s.draft ? SPEC_NAME : null, source_page: s.draft?.page ?? null,
      source_quote: s.draft?.quote ?? '',
    }),
  );
}

const SECTIONS: [string, string, number, number][] = [
  ['01 14 00', 'WORK RESTRICTIONS', 12, 15],
  ['07 54 23', 'THERMOPLASTIC POLYOLEFIN (TPO) ROOFING', 210, 224],
  ['10 28 00', 'TOILET ACCESSORIES', 402, 406],
  ['23 09 00', 'INSTRUMENTATION AND CONTROL FOR HVAC', 512, 530],
  ['28 46 21.11', 'ADDRESSABLE FIRE-ALARM SYSTEMS', 640, 655],
];

export function specSections(projectId: string): SpecSection[] {
  if (projectId !== 'job-a') return [];
  return [
    { file_id: 'mock-spec-book-1', file_name: 'Sample Spec Book Vol 1.pdf', page_count: null, text_ready: false, section: null, title: null,
      first_page: null, last_page: null },
    ...SECTIONS.map(([section, title, first, last]) => ({
      file_id: SPEC_FILE, file_name: SPEC_NAME, page_count: 700, text_ready: true, section, title, first_page: first, last_page: last,
    })),
  ];
}

/** What reading a section finds (synthetic): by its first page, or for pasted text. */
interface Found {
  kind: RequirementKind;
  title: string;
  section: string;
  sectionTitle: string;
  ref: string;
  responsible: string;
  required: RequiredOption;
  notice: number | null;
  activity: string;
  quote: string;
  page: number | null;
}

const FIRE_ALARM: Found[] = [
  { kind: 'witness', title: 'Fire alarm acceptance test', section: '28 46 21.11', sectionTitle: 'Addressable Fire-Alarm Systems', ref: '3.4.B',
    responsible: 'Contractor', required: 'yes', notice: 10, activity: 'Acceptance test', page: 652,
    quote: "Give the Fire Marshal at least 10 working days' notice before the acceptance test." },
  { kind: 'training', title: 'Fire alarm owner training (4 hours)', section: '28 46 21.11', sectionTitle: 'Addressable Fire-Alarm Systems',
    ref: '3.6.A', responsible: 'Contractor', required: 'yes', notice: 14, activity: 'Training', page: 654,
    quote: "Schedule training with at least 14 days' notice." },
  { kind: 'closeout_doc', title: 'Fire alarm O&M manual', section: '28 46 21.11', sectionTitle: 'Addressable Fire-Alarm Systems', ref: '1.6.A',
    responsible: '', required: 'yes', notice: null, activity: '', page: 641,
    quote: 'Operation and Maintenance Data: For the fire-alarm system, in bookmarked PDF.' },
];

export function foundIn(firstPage: number | null, text: string): Found[] {
  if (firstPage === 640) return FIRE_ALARM;
  if (firstPage !== null) return [];
  const sentence = (text.split(/(?<=\.)\s/)[0] ?? text).trim().slice(0, 300);
  return [{ kind: 'other', title: sentence.slice(0, 60), section: '', sectionTitle: '', ref: '', responsible: '', required: 'yes',
    notice: null, activity: '', quote: sentence, page: null }];
}
