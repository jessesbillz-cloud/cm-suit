// Requirements' pure rules for the screens (migration 0069): the views and groupings, which lines each view shows, the
// due words, a line's facts and its trigger in words. Dates come from the database (due_on, days_left on the job's
// clock); nothing here computes a due date. Unit-tested in model.test.ts.
import type { Requirement } from '../../data/requirements.types';
import { formatDay } from '../../lib/dates';
import { NEW_ITEM, READ_ITEM } from '../../lib/itemIds';
import { DUE_WINDOW_DAYS, isOpenStatus, REQUIREMENT_KINDS } from '../../lib/requirements';

export { NEW_ITEM, READ_ITEM };

export type RequirementsView = 'due' | 'all' | 'drafts';

export function viewsFor(canManage: boolean, drafts: number): { value: RequirementsView; label: string }[] {
  const views: { value: RequirementsView; label: string }[] = [
    { value: 'due', label: 'Due' },
    { value: 'all', label: 'All' },
  ];
  return canManage ? [...views, { value: 'drafts', label: drafts > 0 ? `Drafts ${String(drafts)}` : 'Drafts' }] : views;
}

export function parseView(v: string | undefined): RequirementsView {
  return v === 'all' || v === 'drafts' ? v : 'due';
}

export type Grouping = 'kind' | 'section';
export const GROUPINGS: readonly { value: Grouping; label: string }[] = [
  { value: 'kind', label: 'By kind' },
  { value: 'section', label: 'By section' },
];

export function parseGrouping(v: string | undefined): Grouping {
  return v === 'section' ? 'section' : 'kind';
}

/** Due: kept, still to do, dated, late or due within the window; soonest first (the list comes by due date). */
export function dueRows(rows: readonly Requirement[]): Requirement[] {
  return rows.filter((r) => !r.draft && isOpenStatus(r.status) && r.days_left !== null && r.days_left <= DUE_WINDOW_DAYS);
}

export function keptRows(rows: readonly Requirement[]): Requirement[] {
  return rows.filter((r) => !r.draft);
}

/** The AI's drafts in the book's order: by section, then page. */
export function draftRows(rows: readonly Requirement[]): Requirement[] {
  return rows
    .filter((r) => r.draft)
    .sort((a, b) => a.spec_section.localeCompare(b.spec_section) || (a.source_page ?? 0) - (b.source_page ?? 0) || a.created_at.localeCompare(b.created_at));
}

interface Group {
  key: string;
  label: string;
  rows: Requirement[];
}

/** All, grouped by kind (the kinds' order) or by spec section (by number; none last). */
export function groupRows(rows: readonly Requirement[], by: Grouping): Group[] {
  if (by === 'kind') {
    return REQUIREMENT_KINDS.map((k) => ({ key: k.value, label: k.long, rows: rows.filter((r) => r.kind === k.value) })).filter((g) => g.rows.length > 0);
  }
  const keys = [...new Set(rows.map((r) => r.spec_section))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  return keys.map((key) => {
    const inIt = rows.filter((r) => r.spec_section === key);
    const title = inIt.find((r) => r.spec_title !== '')?.spec_title ?? '';
    return { key: key === '' ? 'none' : key, label: key === '' ? 'No section' : [key, title].filter((s) => s !== '').join(' '), rows: inIt };
  });
}

interface DueWords {
  text: string;
  late: boolean;
}

/** "Due Nov 2", "Due today", "Late · Oct 28" (red; a finished line is never late); null when it has no date yet. */
export function dueWords(r: Pick<Requirement, 'due_on' | 'days_left' | 'status'>): DueWords | null {
  if (r.due_on === null || r.days_left === null) return null;
  if (!isOpenStatus(r.status)) return { text: `Due ${formatDay(r.due_on, 'MMM d')}`, late: false };
  if (r.days_left < 0) return { text: `Late · ${formatDay(r.due_on, 'MMM d')}`, late: true };
  if (r.days_left === 0) return { text: 'Due today', late: true };
  return { text: `Due ${formatDay(r.due_on, 'MMM d')}`, late: false };
}

/** A line's second row: who, and where in the book ("Owner · 10 28 00 ¶1.3.A"). */
export function rowFacts(r: Pick<Requirement, 'responsible' | 'spec_section' | 'spec_ref'>): string {
  const where = [r.spec_section, r.spec_ref === '' ? '' : `¶${r.spec_ref}`].filter((s) => s !== '').join(' ');
  return [r.responsible, where].filter((s) => s !== '').join(' · ');
}

/** "60 days before Restroom finishes start (Dec 2)": the rule in words, or null when there is nothing to say. */
export function triggerWords(r: Pick<Requirement, 'notice_days' | 'lead_days' | 'activity_name' | 'trigger_date'>): string | null {
  const days = (r.notice_days ?? 0) + (r.lead_days ?? 0);
  const when = r.trigger_date === null ? '' : formatDay(r.trigger_date, 'MMM d');
  const what = r.activity_name !== '' && when !== '' ? `${r.activity_name} (${when})` : r.activity_name || when;
  if (what === '') return days > 0 ? `${String(days)} days before the trigger` : null;
  return days > 0 ? `${String(days)} days before ${what}` : what;
}

/** After a read: "3 drafts · 1 already here" (and any left out for want of a quote). */
export function readWords(r: { found: number; added: number; skipped: number; unquoted: number }): string {
  if (r.found === 0) return 'Nothing found in that section.';
  return [
    `${String(r.added)} ${r.added === 1 ? 'draft' : 'drafts'}`,
    r.skipped > 0 ? `${String(r.skipped)} already here` : '',
    r.unquoted > 0 ? `${String(r.unquoted)} without a quote` : '',
  ]
    .filter((s) => s !== '')
    .join(' · ');
}

/** A found section's pages, at most one read's worth (40). */
export function readPages(first: number, last: number): { first: number; last: number } {
  return { first, last: Math.min(last, first + 39) };
}

/** The header's line: "2 late · 5 due in 60 days". */
export function headerCounts(rows: readonly Requirement[]): { late: number; soon: number } {
  const due = dueRows(rows);
  const late = due.filter((r) => (r.days_left ?? 0) < 0).length;
  return { late, soon: due.length - late };
}
