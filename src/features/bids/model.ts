// Bids screen helpers: the sub-views, chip mappings (colors from lib/status only), the default package code,
// and the invite textarea parser. Pure functions, unit-testable.
import { z } from 'zod';
import type { StatusKey } from '../../lib/status';
import type { InviteRecipient } from '../../data/bids.types';

export const BIDS_VIEWS = ['coverage', 'packages', 'subs', 'received', 'leveling', 'summary', 'questions', 'addenda'] as const;
export type BidsView = (typeof BIDS_VIEWS)[number];

export const VIEW_LABELS: Record<BidsView, string> = {
  coverage: 'Coverage',
  packages: 'Packages',
  subs: 'Subs',
  questions: 'Questions',
  addenda: 'Addenda',
  received: 'Received',
  leveling: 'Leveling',
  summary: 'Summary',
};

/** Sub-views that open the submissions: hidden while the job is sealed and bid time has not come (SPEC §11.4). */
export const SEALED_VIEWS: readonly BidsView[] = ['received', 'leveling', 'summary'];

export function parseView(v: string | undefined): BidsView {
  return BIDS_VIEWS.find((x) => x === v) ?? 'coverage';
}

/** The right-column item that holds the invite form (never a row id: rows are uuids). */
export const INVITE_ITEM = 'invite';

/** The right-column item that holds the "Add sub" form. */
export const NEW_SUB_ITEM = 'new-sub';

export interface Chip {
  status: StatusKey;
  label: string;
}

const INVITE_CHIPS: Record<string, Chip> = {
  sent: { status: 'pending', label: 'Sent' },
  delivered: { status: 'pending', label: 'Delivered' },
  opened: { status: 'pending', label: 'Opened' },
  bounced: { status: 'blocked', label: 'Bounced' },
  intends: { status: 'assigned', label: 'Bidding' },
  declined: { status: 'cancelled', label: 'Not bidding' },
  submitted: { status: 'confirmed', label: 'Submitted' },
  late: { status: 'postponed', label: 'Late' },
};

export function inviteChip(status: string): Chip {
  return INVITE_CHIPS[status] ?? { status: 'pending', label: status };
}

const QUESTION_CHIPS: Record<string, Chip> = {
  open: { status: 'pending', label: 'Open' },
  answered: { status: 'confirmed', label: 'Answered' },
  addendum: { status: 'assigned', label: 'Addendum' },
  rfi: { status: 'assigned', label: 'RFI' },
  dismissed: { status: 'cancelled', label: 'Dismissed' },
};

export function questionChip(status: string): Chip {
  return QUESTION_CHIPS[status] ?? { status: 'pending', label: status };
}

/** The read chip on a received row: findings drafted or confirmed, else whether the file's text could be read. */
export function readChip(extraction: { status: string } | undefined, textStatus: string | undefined): Chip {
  if (extraction) return extraction.status === 'confirmed' ? { status: 'confirmed', label: 'Confirmed' } : { status: 'assigned', label: 'Read' };
  if (textStatus === 'none' || textStatus === 'failed') return { status: 'blocked', label: "Can't read" };
  return { status: 'pending', label: 'Not read' };
}

/** Whether "Read all" should try this bid: no findings yet and the file is not known to be unreadable. */
export function isUnread(extraction: { status: string } | undefined, textStatus: string | undefined): boolean {
  return extraction === undefined && textStatus !== 'none' && textStatus !== 'failed';
}

export function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '');
  return line?.trim() ?? '';
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * A suggested code for a new package: the one after the highest code in use (02A -> 02B, 02Z -> 03A), skipping
 * taken ones. Only a default the estimator can change; the database's unique constraint is what decides.
 */
export function nextPackageCode(codes: readonly string[]): string {
  const taken = new Set(codes);
  const valid = codes.filter((c) => /^\d{2}[A-Z]$/.test(c)).sort();
  const last = valid[valid.length - 1];
  let n = last ? Number(last.slice(0, 2)) : 1;
  let i = last ? LETTERS.indexOf(last.charAt(2)) + 1 : 0;
  while (n <= 99) {
    for (; i < LETTERS.length; i += 1) {
      const code = `${String(n).padStart(2, '0')}${LETTERS.charAt(i)}`;
      if (!taken.has(code)) return code;
    }
    n += 1;
    i = 0;
  }
  return '99Z';
}

const email = z.string().trim().toLowerCase().email();

/** One invitee per line: "someone@example.com" or "Company Name <someone@example.com>". */
export function parseRecipients(text: string): { recipients: InviteRecipient[]; bad: string[] } {
  const recipients: InviteRecipient[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const m = /^(.*?)\s*<([^>]+)>$/.exec(line);
    const company = m?.[1]?.trim() ?? '';
    const parsed = email.safeParse(m?.[2] ?? line);
    if (!parsed.success) {
      bad.push(line);
      continue;
    }
    if (seen.has(parsed.data)) continue;
    seen.add(parsed.data);
    recipients.push(company === '' ? { email: parsed.data } : { email: parsed.data, company });
  }
  return { recipients, bad };
}

/** A bidder as shown to managers: the company, else the person's name. Both come from people_display. */
export function bidderName(p: { company: string; full_name: string } | undefined): string {
  if (!p) return 'Bidder';
  return p.company !== '' ? p.company : p.full_name;
}
