// Settings objects (CLAUDE.md rule 9): one zod schema per settings object, defaults defined here only.
// orgs.settings and projects.settings are jsonb; the data layer parses them through these schemas.
// orgs.settings.daily_forms (each company's setup of its daily forms, SPEC §18.1 principle 10) is a settings object of its
// own: its one schema and default are shared with the edge functions (supabase/functions/_shared/reportForms.ts
// formSetupSchema), it is read through data/dailies.queries useCompanyForms and saved only by save_daily_form.
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
  /** A PE can turn the ball-in-court column on for themselves; the project default is off (SPEC §7.4). */
  show_ball_in_court: false,
  /** Inspections: the GC approves a request before it reaches the inspector (SPEC §13.2). The database reads a missing key as off. */
  ir_gc_approval: false,
  /** Inspections: OFS is one of the request types on this job. */
  ir_ofs_allowed: false,
  /** Inspections: the words a sub confirms before an OFS request goes to the GC. Null: the database's standard wording
   *  (ir_ofs_attest_wording, 0091), which the form and the settings box read from the database. */
  ir_ofs_attest_text: null as string | null,
  /** OFS review (0106): the divisions and sections (2, 4 or 6 digits) whose RFIs and submittals are suggested fire / life
   *  safety. Null: the database's standard list (ofs_fire_default), which the settings box reads from the database. */
  ofs_fire_sections: null as string[] | null,
};

/** One entry of the job's fire list: a division ("21"), a level 2 ("0784") or a section ("078100"). */
const FIRE_ENTRY = /^[0-4]\d(\d{2}){0,2}$/;

const projectSettingsSchema = z.object({
  show_ball_in_court: z.boolean().catch(PROJECT_SETTINGS_DEFAULTS.show_ball_in_court),
  ir_gc_approval: z.boolean().catch(PROJECT_SETTINGS_DEFAULTS.ir_gc_approval),
  ir_ofs_allowed: z.boolean().catch(PROJECT_SETTINGS_DEFAULTS.ir_ofs_allowed),
  ir_ofs_attest_text: z.string().trim().min(1).max(1000).nullable().catch(PROJECT_SETTINGS_DEFAULTS.ir_ofs_attest_text),
  ofs_fire_sections: z.array(z.string().regex(FIRE_ENTRY)).min(1).max(100).nullable().catch(PROJECT_SETTINGS_DEFAULTS.ofs_fire_sections),
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

/**
 * The fire list as typed in the job's settings ("21, 28, 07 81 00"): its entries, each once and sorted, and what is not
 * an entry. Nothing typed: null (the standard list).
 */
export function parseFireList(text: string): { list: string[] | null; bad: string[] } {
  const parts = text.split(/[,;\n]+/).map((p) => p.replace(/\s+/g, '')).filter((p) => p !== '');
  const good = [...new Set(parts.filter((p) => FIRE_ENTRY.test(p)))].sort();
  return { list: good.length > 0 ? good : null, bad: parts.filter((p) => !FIRE_ENTRY.test(p)) };
}
