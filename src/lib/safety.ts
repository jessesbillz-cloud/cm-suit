// Safety (migration 0060): the topic library's categories, the meeting kinds, the sign-in link's address and when the
// next tailgate is due. The ONE place these lists and labels live (the database's safety_category_ok checks the same
// category values; the due day is the database's safety_due_on).

/** The library's categories, as the chips show them. */
export const SAFETY_CATEGORIES = [
  { value: 'falls', label: 'Falls' },
  { value: 'health', label: 'Health' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'excavation', label: 'Excavation' },
  { value: 'fire', label: 'Fire' },
  { value: 'site', label: 'Site' },
  { value: 'other', label: 'Other' },
] as const;

export function categoryLabel(category: string): string {
  return SAFETY_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export const MEETING_KINDS = [
  { value: 'tailgate', label: 'Tailgate' },
  { value: 'meeting', label: 'Meeting' },
] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number]['value'];

/** "Tailgate 12". */
export function meetingLabel(kind: string, number: number): string {
  return `${kind === 'tailgate' ? 'Tailgate' : 'Meeting'} ${String(number)}`;
}

/** The sign-in page: /m/<meeting>?t=<token>. */
export function meetingLinkUrl(origin: string, basePath: string, meetingId: string, token: string): string {
  return `${origin}${basePath.replace(/\/+$/, '')}/m/${encodeURIComponent(meetingId)}?t=${encodeURIComponent(token)}`;
}

/** This device's copy of a meeting's sign-in link (lib/requestLink rememberLink: shown while the server's matches). */
export const meetingLinkKey = (meetingId: string): string => `app:meeting-link:${meetingId}`;

/** How the next tailgate stands on a job (8 CCR 1509(e): every 10 working days). */
type TailgateDue = 'overdue' | 'today' | 'later';

/** Days as yyyy-MM-dd compare as text. */
export function tailgateDue(today: string, dueOn: string): TailgateDue {
  if (dueOn < today) return 'overdue';
  return dueOn === today ? 'today' : 'later';
}

/** Sign-in from the QR ends this long after the start (the database's link_meeting_open). */
export const SIGNIN_HOURS = 18;
