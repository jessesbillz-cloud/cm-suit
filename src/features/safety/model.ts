// Safety's pure rules for the screens (migration 0060): the views, the item ids, the topic search, the line about the
// next tailgate and a meeting row's facts. Unit-tested in model.test.ts.
import type { MeetingRow, SafetyDue, Topic } from '../../data/safety.types';
import { formatDay } from '../../lib/dates';
import { NEW_ITEM, NEW_TOPIC_ITEM, TOPIC_ITEM_PREFIX } from '../../lib/itemIds';
import { SAFETY_CATEGORIES, tailgateDue } from '../../lib/safety';

export { NEW_ITEM, NEW_TOPIC_ITEM };

export type SafetyView = 'meetings' | 'library';
export const VIEWS: readonly { value: SafetyView; label: string }[] = [
  { value: 'meetings', label: 'Meetings' },
  { value: 'library', label: 'Library' },
];

export function parseView(v: string | undefined): SafetyView {
  return v === 'library' ? 'library' : 'meetings';
}

/** A library topic opens as `topic-<id>`; a meeting opens by its own id. */
export function topicItemId(id: string): string {
  return `${TOPIC_ITEM_PREFIX}${id}`;
}

export function topicIdOf(itemId: string): string | null {
  return itemId.startsWith(TOPIC_ITEM_PREFIX) ? itemId.slice(TOPIC_ITEM_PREFIX.length) : null;
}

/** Topics that match the search (title, points, source) in a category (null: every category). */
export function filterTopics(topics: readonly Topic[], q: string, category: string | null): Topic[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter((w) => w !== '');
  return topics.filter((t) => {
    if (category !== null && t.category !== category) return false;
    const text = [t.title, t.source ?? '', ...t.points].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** The categories that have topics, in the library's order. */
export function categoriesOf(topics: readonly Topic[]): { value: string; label: string }[] {
  return SAFETY_CATEGORIES.filter((c) => topics.some((t) => t.category === c.value)).map((c) => ({ value: c.value, label: c.label }));
}

/** The header's line about the next tailgate (8 CCR 1509(e): every 10 working days). */
export function dueLine(due: SafetyDue): { text: string; late: boolean } {
  if (due.last_held_on === null) return { text: 'No tailgate yet', late: true };
  const state = tailgateDue(due.today, due.due_on);
  if (state === 'overdue') return { text: 'Tailgate overdue', late: true };
  if (state === 'today') return { text: 'Tailgate due today', late: true };
  return { text: `Next tailgate by ${formatDay(due.due_on, 'MMM d')}`, late: false };
}

/** A meeting row's second line: "Tailgate · Oct 3 · Sol Super · 14 signed". */
export function rowFacts(r: MeetingRow): string {
  const kind = r.kind === 'tailgate' ? 'Tailgate' : 'Meeting';
  return [kind, formatDay(r.held_on, 'EEE, MMM d'), r.leader_name, `${String(r.signed)} signed`].join(' · ');
}

/** A textarea's lines: trimmed, empty ones dropped. */
export function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => l !== '');
}
