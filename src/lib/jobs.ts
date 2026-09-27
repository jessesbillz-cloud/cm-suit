// Job and company choices: stages, company kinds and modules. The ONE place these lists and their labels live.
// The database checks stage and kind (projects.stage, orgs.kind); the modules default is the projects.modules column.
import type { RailTool } from './layout';

export const STAGES = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'bidding', label: 'Bidding' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'lost', label: 'Lost' },
  { value: 'construction', label: 'Construction' },
  { value: 'closeout', label: 'Closeout' },
  { value: 'archived', label: 'Archived' },
] as const;

export const ORG_KINDS = [
  { value: 'gc', label: 'General contractor' },
  { value: 'sub', label: 'Subcontractor' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'architect', label: 'Architect / engineer' },
  { value: 'owner', label: 'Owner' },
  { value: 'other', label: 'Other' },
] as const;

/** Tools a job can switch off. Board, People and Settings are always there. */
export const MODULES = [
  { value: 'bids', label: 'Bids' },
  { value: 'files', label: 'Files' },
  { value: 'calendar', label: 'Calendar' },
] as const satisfies readonly { value: RailTool; label: string }[];

const MODULE_TOOLS: readonly string[] = MODULES.map((m) => m.value);

/** Is this tool on for a job with these modules? */
export function toolIsOn(tool: string, modules: readonly string[]): boolean {
  return !MODULE_TOOLS.includes(tool) || modules.includes(tool);
}

/** The rail for a job: my rail picks minus the job's switched-off modules. null = "All my jobs": my picks as they are. */
export function railForJob<T extends string>(railItems: readonly T[], modules: readonly string[] | null): T[] {
  return modules === null ? [...railItems] : railItems.filter((t) => toolIsOn(t, modules));
}

/** A new job's stage, prefilled from the company kind: contractors start bidding, everyone else is building. */
export function defaultStage(orgKind: string): string {
  return orgKind === 'gc' || orgKind === 'sub' ? 'bidding' : 'construction';
}

/** Stages where a bid due time means something. */
export function isBidStage(stage: string): boolean {
  return stage === 'prospect' || stage === 'bidding';
}
