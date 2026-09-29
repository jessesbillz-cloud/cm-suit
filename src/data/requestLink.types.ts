// The inspection request link and the inspector's hub (SPEC §6.4 #4, migration 0046): the public answers (checked
// with zod, so a changed contract fails here) and the member-side state.
import { z } from 'zod';

/** How a public request page was opened: the job's own token, or a hub's token with the hub's id. */
export interface LinkKey {
  projectId: string;
  token: string;
  hubId: string | null;
}

export const openAnswerSchema = z.object({
  project_name: z.string(),
  /** This device's session is already on the job: straight in. */
  member: z.boolean(),
  /** ...and may request inspections there: straight to the form. */
  can_request: z.boolean(),
});
export type OpenAnswer = z.infer<typeof openAnswerSchema>;

export const joinAnswerSchema = z.object({ project_name: z.string(), status: z.enum(['added', 'member']) });
export type JoinAnswer = z.infer<typeof joinAnswerSchema>;

export const hubAnswerSchema = z.object({ jobs: z.array(z.object({ project_id: z.string(), name: z.string() })) });
export type HubAnswer = z.infer<typeof hubAnswerSchema>;

/** The job's link: on or off, and when the link that works now was made. */
export interface RequestLinkState {
  active: boolean;
  since: string | null;
}

/** My hub: do I decide inspections anywhere, the hub (if made), when, and how many jobs it lists now. */
export interface HubState {
  decides: boolean;
  hub_id: string | null;
  made_at: string | null;
  jobs: number;
}

/** A link just made: the raw token (shown only on this device) and the moment it was made. */
export interface MadeLink {
  token: string;
  made_at: string;
}

export interface MadeHub extends MadeLink {
  hub_id: string;
}
