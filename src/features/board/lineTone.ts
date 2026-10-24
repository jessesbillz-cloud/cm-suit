// What a board line means at a glance (Jesse, Oct 23: "a lot of information on the board ... a color code on things"):
// a short type word ("IR", "OFS", "RFI"), the lib/status color of what happened, and the chip's word for it. Green
// approved or done, red not approved or returned, yellow waiting on someone, blue sent or scheduled, gray only telling.
// An impact claimed keeps the amber row (CLAUDE.md rule 15), never a chip. Kinds are the server's (boardKinds); a kind
// added later falls back to its first word and the neutral tone. Data about the code, not about any job.
import type { RequestFacts } from '../../data/board.queries';
import type { StatusKey } from '../../lib/status';

/** 'impact' = the amber row (impact claimed), which lib/status does not color. */
type LineTone = StatusKey | 'impact';

export interface LineLook {
  /** The bold type word the line starts with. */
  type: string;
  tone: LineTone;
  /** The chip's word; null = no chip (a line that only tells). */
  word: string | null;
}

/** The event's first word -> the type word. */
const TYPE: Record<string, string> = {
  addendum: 'Addendum',
  bid: 'Bid',
  comment: 'Comment',
  correction: 'CN',
  daily: 'Daily',
  delivery: 'Delivery',
  file: 'File',
  file_infected: 'File',
  ir: 'IR',
  member: 'People',
  ofs: 'OFS',
  permit: 'Permit',
  requirements: 'Requirement',
  rfi: 'RFI',
  safety: 'Safety',
  schedule: 'Schedule',
};

/** kind -> [tone, chip word]. A kind not listed only tells (neutral, no chip). */
const TONE: Record<string, [LineTone, string]> = {
  'addendum.issued': ['assigned', 'Issued'],
  'bid.answer': ['confirmed', 'Answered'],
  'bid.invited': ['assigned', 'Invited'],
  'bid.question': ['pending', 'Question'],
  'bid.received': ['confirmed', 'Received'],
  'correction.corrected': ['corrected', 'Corrected'],
  'correction.opened': ['not_approved', 'Opened'],
  'correction.ready': ['ready', 'Ready'],
  'correction.reopened': ['not_approved', 'Reopened'],
  'correction.signed_off': ['approved', 'Signed off'],
  'delivery.posted': ['assigned', 'Scheduled'],
  file_infected: ['blocked', 'Blocked'],
  'ir.gc_review': ['gc_review', 'GC review'],
  'ir.helper': ['assigned', 'Assigned'],
  'ir.moved': ['assigned', 'Moved'],
  'ir.ofs': ['assigned', 'Sent'],
  'ir.ofs_accepted': ['confirmed', 'Accepted'],
  'ir.ofs_confirmed': ['confirmed', 'Confirmed'],
  'ir.ofs_proposed': ['pending', 'New time'],
  'ir.postponed': ['postponed', 'Postponed'],
  'ir.pulled_back': ['cancelled', 'Pulled back'],
  'ir.requested': ['assigned', 'Requested'],
  'ir.returned': ['not_approved', 'Returned'],
  'ir.withdrawn': ['cancelled', 'Withdrawn'],
  'ofs.approved': ['approved', 'Approved'],
  'ofs.not_approved': ['not_approved', 'Not approved'],
  'permit.approved_set': ['approved', 'Approved'],
  'permit.comment': ['pending', 'Comment'],
  'permit.response': ['assigned', 'Response'],
  'permit.review': ['pending', 'Review'],
  'requirements.due': ['pending', 'Due'],
  'rfi.answered': ['confirmed', 'Answered'],
  'rfi.asked': ['pending', 'Asked'],
  'rfi.impact_claimed': ['impact', 'Impact claimed'],
  'rfi.impact_note': ['impact', 'Impact note'],
  'rfi.issued': ['assigned', 'Issued'],
  'rfi.returned': ['not_approved', 'Returned'],
  'rfi.review': ['pending', 'To review'],
  'rfi.to_issue': ['pending', 'To issue'],
  'rfi.voided': ['cancelled', 'Voided'],
  'safety.tailgate_due': ['pending', 'Due'],
  'schedule.update_due': ['pending', 'Due'],
};

/** A line that only tells: gray, no chip. */
const NEUTRAL: [LineTone, string] = ['info', ''];

function results(facts: RequestFacts | null): [LineTone, string] {
  if (facts?.result === 'approved') return ['approved', 'Approved'];
  if (facts?.result === 'not_approved') return ['not_approved', 'Not approved'];
  return ['info', 'Results'];
}

/** The line's type word, color and chip word, from its kind and (for an inspection request) the request's facts. */
export function lineLook(kind: string, facts: RequestFacts | null = null): LineLook {
  const first = kind.split('.')[0] ?? '';
  const ofs = first === 'ofs' || kind.startsWith('ir.ofs') || (first === 'ir' && facts?.ofs === true);
  const type = ofs ? 'OFS' : (TYPE[first] ?? 'Note');
  const [tone, word] = kind === 'ir.results' ? results(facts) : (TONE[kind] ?? NEUTRAL);
  return { type, tone, word: word === '' ? null : word };
}
