// The request link's contract (SPEC §6.4 #4, §13.2): what a call to the public request-link function may carry and
// what an answer may contain. Pure (no I/O), so the whitelist is unit-tested (requestLink_test.ts). The SQL side
// (link_request_* in migration 0046) already returns only these fields; the function passes everything through these
// projections as well, so a later change to the SQL can never widen what the public pages see.
import { uuid, z } from './validate.ts';

/** 32 random bytes as base64url: the shape rotate_request_link and rotate_request_hub hand out. */
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Malformed token');
const clean = (max: number) => z.string().trim().min(1).max(max);

/** A job's request page opens with the job's own token, or with a hub's token and the hub's id. */
const job = { project_id: uuid, token, hub_id: uuid.optional() };

export const RequestLinkBody = z.discriminatedUnion('action', [
  /** The job's name, and whether this device's session is already on the job. */
  z.object({ action: z.literal('open'), ...job }).strict(),
  /** After the email code: records a sub invite for the signed-in address (never from the body). */
  z.object({ action: z.literal('join'), ...job, name: clean(120), company: clean(120) }).strict(),
  /** The hub's list of jobs. */
  z.object({ action: z.literal('hub'), hub_id: uuid, token }).strict(),
]);
export type RequestLinkRequest = z.infer<typeof RequestLinkBody>;

const Opened = z.object({ project_name: z.string() });
const Joined = z.object({ project_name: z.string(), status: z.enum(['added', 'member']) });
const Hub = z.object({ jobs: z.array(z.object({ project_id: uuid, name: z.string() })) });

// A type alias (not an interface) so it fits http.ts's Json record.
export type OpenAnswer = {
  project_name: string;
  /** The caller's own session is an active member of the job (they go straight in). */
  member: boolean;
  /** ...and may request inspections there (they land in the request form). */
  can_request: boolean;
};
export type JoinAnswer = z.infer<typeof Joined>;
export type HubAnswer = z.infer<typeof Hub>;

/** The job name only (zod object parsing drops every key not listed). */
export function openedJob(raw: unknown): { project_name: string } {
  return Opened.parse(raw);
}

/** The open answer: the job's name plus two facts about the caller's own session. */
export function openAnswer(raw: unknown, member: boolean, canRequest: boolean): OpenAnswer {
  return { project_name: openedJob(raw).project_name, member, can_request: member && canRequest };
}

export function joinAnswer(raw: unknown): JoinAnswer {
  return Joined.parse(raw);
}

/** Job names and ids only: nothing about the hub's owner. */
export function hubAnswer(raw: unknown): HubAnswer {
  return Hub.parse(raw);
}
