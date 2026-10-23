// The fire marshal's list as cascading groups (Jesse, Oct 22: "in a cascading or expanding list"): Waiting and Done
// (Approved, Not approved), each with Submittals by spec section and RFIs by number. And the designated person's lists:
// Waiting on OFS and Back from OFS. Pure, unit-tested.
import type { DeskRow, DeskState, OfsReviewRow } from '../../data/ofs.types';

interface SectionGroup {
  /** The 6 digits, or '' for submittals without one. */
  key: string;
  /** "21 13 13", or "No section". */
  label: string;
  rows: OfsReviewRow[];
}

export interface Branch {
  submittals: SectionGroup[];
  rfis: OfsReviewRow[];
  count: number;
}

interface ReviewTree {
  waiting: Branch;
  approved: Branch;
  notApproved: Branch;
}

const pad = (n: number) => String(n).padStart(3, '0');

/** "21 13 13" from "211313"; "No section" without one. */
export function sectionLabel(key: string | null): string {
  return key === null || !/^\d{6}$/.test(key) ? 'No section' : `${key.slice(0, 2)} ${key.slice(2, 4)} ${key.slice(4, 6)}`;
}

/** An RFI's number: the RFI tool's own, else the number its document's name gives ("RFI 012 ..."). */
export function rfiNo(r: Pick<OfsReviewRow, 'number' | 'title'>): number | null {
  if (r.number !== null) return r.number;
  const m = /\bRFI[\s_#-]*0*(\d{1,5})\b/i.exec(r.title);
  return m?.[1] ? Number(m[1]) : null;
}

/** What a row says: "RFI 012 · Sample title" for an RFI of the RFI tool, a document's or submittal's own name. */
export function rowTitle(r: Pick<OfsReviewRow, 'kind' | 'number' | 'title'>): string {
  return r.kind === 'rfi' && r.number !== null ? `RFI ${pad(r.number)} · ${r.title}` : r.title;
}

const byTitle = (a: OfsReviewRow, b: OfsReviewRow) => a.title.localeCompare(b.title, 'en', { numeric: true });

function branch(rows: readonly OfsReviewRow[]): Branch {
  const bySection = new Map<string, OfsReviewRow[]>();
  for (const r of rows.filter((x) => x.kind === 'submittal')) {
    const key = r.section !== null && /^\d{6}$/.test(r.section) ? r.section : '';
    bySection.set(key, [...(bySection.get(key) ?? []), r]);
  }
  const submittals = [...bySection]
    // Sections in order, "No section" last.
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([key, list]) => ({ key, label: sectionLabel(key === '' ? null : key), rows: [...list].sort(byTitle) }));
  const rfis = rows
    .filter((x) => x.kind !== 'submittal')
    .sort((a, b) => {
      const na = rfiNo(a);
      const nb = rfiNo(b);
      if (na !== nb) return na === null ? 1 : nb === null ? -1 : na - nb;
      return byTitle(a, b);
    });
  return { submittals, rfis, count: rows.length };
}

export function reviewTree(rows: readonly OfsReviewRow[]): ReviewTree {
  return {
    waiting: branch(rows.filter((r) => r.decision === null)),
    approved: branch(rows.filter((r) => r.decision === 'approved')),
    notApproved: branch(rows.filter((r) => r.decision === 'not_approved')),
  };
}

export interface DeskGroup {
  key: string;
  label: string;
  rows: DeskRow[];
}

const KIND_LABEL: Record<DeskRow['kind'], string> = {
  submittal: 'Submittals',
  rfi: 'RFIs',
  rfi_document: 'RFIs',
  inspection: 'Inspections',
};

const BACK: readonly [Exclude<DeskState, 'waiting'>, string][] = [
  ['approved', 'Approved'],
  ['not_approved', 'Not approved'],
  ['passed', 'Passed'],
  ['failed', 'Failed'],
];

/** Waiting on OFS by kind (Submittals, RFIs, Inspections); Back from OFS by outcome. Empty groups are left out. */
export function deskLists(rows: readonly DeskRow[]): { waiting: DeskGroup[]; back: DeskGroup[] } {
  const waiting = rows.filter((r) => r.state === 'waiting');
  const kinds = ['Submittals', 'RFIs', 'Inspections'].map((label) => ({
    key: label.toLowerCase(),
    label,
    rows: waiting.filter((r) => KIND_LABEL[r.kind] === label),
  }));
  const back = BACK.map(([state, label]) => ({ key: state, label, rows: rows.filter((r) => r.state === state) }));
  return { waiting: kinds.filter((g) => g.rows.length > 0), back: back.filter((g) => g.rows.length > 0) };
}

/** What a desk row says: "OFS 12 · ..." for an inspection, "RFI 012 · ..." for an RFI of the RFI tool. */
export function deskTitle(r: DeskRow): string {
  if (r.kind === 'inspection') return r.number === null ? r.title : `OFS ${String(r.number)} · ${r.title}`;
  return r.kind === 'rfi' && r.number !== null ? `RFI ${pad(r.number)} · ${r.title}` : r.title;
}
