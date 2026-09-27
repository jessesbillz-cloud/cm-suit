// Sub directory helpers (SPEC §11.2): trade codes, find, chips (colors from lib/status only), the CSLB lookup link,
// and the pane's draft -> patch. Pure functions, unit-tested in subs.test.ts.
import type { SubContact, SubPatch, SubRow } from '../../data/subs.types';
import type { Chip } from './model';

const CODE = /^\d{2}[A-Z]$/;

/** "09a, 09B 10a" -> ['09A', '09B', '10A'] (sorted, no repeats); null when a part is not a code like 09A. */
export function parseTrades(text: string): string[] | null {
  const parts = text
    .split(/[\s,;]+/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p !== '');
  if (parts.some((p) => !CODE.test(p))) return null;
  return [...new Set(parts)].sort();
}

/** The contact shown on the list line: the first with a name or an email. */
export function mainContact(s: Pick<SubRow, 'contacts'>): SubContact | undefined {
  return s.contacts.find((c) => c.name.trim() !== '' || c.email.trim() !== '') ?? s.contacts[0];
}

/** What the find box searches, lowercased: company, contacts, city, license number. */
export function searchText(s: SubRow): string {
  return [s.company, s.city ?? '', s.cslb_number ?? '', ...s.contacts.flatMap((c) => [c.name, c.email, c.phone])]
    .join(' ')
    .toLowerCase();
}

/** Every word of the query appears somewhere in the text. */
export function matchesQuery(text: string, query: string): boolean {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '')
    .every((w) => text.includes(w));
}

const LICENSE_CHIPS: Record<string, Chip> = {
  active: { status: 'confirmed', label: 'Active' },
  inactive: { status: 'cancelled', label: 'Inactive' },
  suspended: { status: 'blocked', label: 'Suspended' },
  expired: { status: 'not_approved', label: 'Expired' },
};

/** The chip for a recorded CSLB result; none until someone checks. */
export function licenseChip(status: string | null): Chip | null {
  return status === null ? null : (LICENSE_CHIPS[status] ?? null);
}

const HISTORY_CHIPS: Record<string, Chip> = {
  invited: { status: 'pending', label: 'Invited' },
  intends: { status: 'assigned', label: 'Bidding' },
  declined: { status: 'cancelled', label: 'Not bidding' },
  submitted: { status: 'confirmed', label: 'Bid in' },
  awarded: { status: 'approved', label: 'Awarded' },
  note: { status: 'cancelled', label: 'Note' },
};

export function historyChip(kind: string): Chip {
  return HISTORY_CHIPS[kind] ?? { status: 'pending', label: kind };
}

/** The CSLB license detail page for a license number (digits only); null when there is no number. */
export function cslbUrl(licenseNumber: string): string | null {
  const digits = licenseNumber.replace(/\D/g, '');
  return digits === '' ? null : `https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=${digits}`;
}

/** What the pane edits: text as typed. */
export interface SubDraft {
  company: string;
  trades: string;
  contacts: SubContact[];
  city: string;
  zip: string;
  region: string;
  cslb_number: string;
  license_classes: string;
  dir_number: string;
  certifications: string;
  notes: string;
}

export const EMPTY_CONTACT: SubContact = { name: '', email: '', phone: '', title: '' };

export function toDraft(s: SubRow): SubDraft {
  return {
    company: s.company,
    trades: s.trades.join(' '),
    contacts: s.contacts,
    city: s.city ?? '',
    zip: s.zip ?? '',
    region: s.region ?? '',
    cslb_number: s.cslb_number ?? '',
    license_classes: s.license_classes ?? '',
    dir_number: s.dir_number ?? '',
    certifications: s.certifications ?? '',
    notes: s.notes,
  };
}

function cleanContacts(list: readonly SubContact[]): SubContact[] {
  return list
    .map((c) => ({ name: c.name.trim(), email: c.email.trim().toLowerCase(), phone: c.phone.trim(), title: c.title.trim() }))
    .filter((c) => c.name !== '' || c.email !== '' || c.phone !== '' || c.title !== '');
}

function orNull(s: string | null): string | null {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type TextKey = 'city' | 'zip' | 'region' | 'cslb_number' | 'license_classes' | 'dir_number' | 'certifications';
const TEXT_KEYS: readonly TextKey[] = ['city', 'zip', 'region', 'cslb_number', 'license_classes', 'dir_number', 'certifications'];

/**
 * The fields that differ from the last saved row (null when nothing does), or a problem to show instead. Values are
 * compared after the same cleanup on both sides, so untouched fields never save.
 */
export function draftPatch(d: SubDraft, base: SubRow): { patch: SubPatch | null; problem: string | null } {
  const company = collapse(d.company);
  if (company === '') return { patch: null, problem: 'Company is empty.' };
  const trades = parseTrades(d.trades);
  if (trades === null) return { patch: null, problem: 'Trades look like 09A.' };

  const patch: SubPatch = {};
  if (company !== collapse(base.company)) patch.company = company;
  if (!same(trades, [...base.trades].sort())) patch.trades = trades;
  const contacts = cleanContacts(d.contacts);
  if (!same(contacts, cleanContacts(base.contacts))) patch.contacts = contacts;
  for (const k of TEXT_KEYS) {
    const v = orNull(d[k]);
    if (v !== orNull(base[k])) patch[k] = v;
  }
  if (d.notes !== base.notes) patch.notes = d.notes;
  return { patch: Object.keys(patch).length > 0 ? patch : null, problem: null };
}
