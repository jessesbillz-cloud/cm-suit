// Settings objects (CLAUDE.md rule 9): one zod schema per settings object, defaults defined here only.
// orgs.settings and projects.settings are jsonb; the data layer parses them through these schemas.
import { z } from 'zod';

export const ORG_SETTINGS_DEFAULTS = {
  /** A built-in generator for a company's own form (SPEC §8.3), chosen as data. Null = the standard builder. */
  report_generator: null as string | null,
  /** Two-factor for org owners and admins (SPEC §10.3 [confirm]). */
  require_2fa_for_admins: true,
  /** "Read" / "Read all" on received bids (the server's AI reads them). Off until Jesse decides how the app gets Claude. */
  ai_bid_reading: false,
};

const orgSettingsSchema = z.object({
  report_generator: z.string().min(1).max(100).nullable().catch(ORG_SETTINGS_DEFAULTS.report_generator),
  require_2fa_for_admins: z.boolean().catch(ORG_SETTINGS_DEFAULTS.require_2fa_for_admins),
  ai_bid_reading: z.boolean().catch(ORG_SETTINGS_DEFAULTS.ai_bid_reading),
});
type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const PROJECT_SETTINGS_DEFAULTS = {
  /** Contract turnaround for RFIs, set once per project (SPEC §7.4). Shown only on impact-claimed rows. */
  rfi_turnaround_days: 10,
  /** A PE can turn the ball-in-court column on for themselves; the project default is off (SPEC §7.4). */
  show_ball_in_court: false,
};

const projectSettingsSchema = z.object({
  rfi_turnaround_days: z.number().int().min(1).max(365).catch(PROJECT_SETTINGS_DEFAULTS.rfi_turnaround_days),
  show_ball_in_court: z.boolean().catch(PROJECT_SETTINGS_DEFAULTS.show_ball_in_court),
});
export type ProjectSettings = z.infer<typeof projectSettingsSchema>;

function asObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function parseOrgSettings(v: unknown): OrgSettings {
  return orgSettingsSchema.parse({ ...ORG_SETTINGS_DEFAULTS, ...asObject(v) });
}

export function parseProjectSettings(v: unknown): ProjectSettings {
  return projectSettingsSchema.parse({ ...PROJECT_SETTINGS_DEFAULTS, ...asObject(v) });
}
