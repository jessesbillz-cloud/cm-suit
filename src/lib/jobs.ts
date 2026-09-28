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
  { value: 'dailies', label: 'Dailies' },
  { value: 'inspections', label: 'Inspections' },
  { value: 'rfis', label: 'RFIs' },
  { value: 'deliveries', label: 'Deliveries' },
  { value: 'corrections', label: 'Corrections' },
] as const satisfies readonly { value: RailTool; label: string }[];

const MODULE_TOOLS: readonly string[] = MODULES.map((m) => m.value);

/** Is this tool on for a job with these modules? */
export function toolIsOn(tool: string, modules: readonly string[]): boolean {
  return !MODULE_TOOLS.includes(tool) || modules.includes(tool);
}

/** The rail for a job: my rail picks minus the job's switched-off modules. */
export function railForJob<T extends string>(railItems: readonly T[], modules: readonly string[]): T[] {
  return railItems.filter((t) => toolIsOn(t, modules));
}

/**
 * The tools that work across every job ("All my jobs"): the board and calendar of all my jobs, and the bids pipeline.
 * The ONE list: the rail and the phone bar there show only these (Settings stays pinned), and the job picker names them.
 */
export const ALL_JOBS_TOOLS = ['board', 'calendar', 'bids'] as const satisfies readonly RailTool[];

type AllJobsTool = (typeof ALL_JOBS_TOOLS)[number];

function worksAcrossJobs(tool: string): tool is AllJobsTool {
  return (ALL_JOBS_TOOLS as readonly string[]).includes(tool);
}

/** The rail on "All my jobs": my picks, in my order, that work across jobs, minus modules no job of mine has on. */
export function railForAllJobs<T extends string>(railItems: readonly T[], jobModules: readonly (readonly string[])[]): T[] {
  return railItems.filter((t) => worksAcrossJobs(t) && (toolIsOn(t, []) || jobModules.some((m) => toolIsOn(t, m))));
}

/** Where a tool lands on "All my jobs": itself when it works across jobs (Settings too), else the board. */
export function allJobsTool(tool: string): AllJobsTool | 'settings' {
  if (tool === 'settings') return 'settings';
  return worksAcrossJobs(tool) ? tool : 'board';
}

/** A new job's stage, prefilled from the company kind: contractors start bidding, everyone else is building. */
export function defaultStage(orgKind: string): string {
  return orgKind === 'gc' || orgKind === 'sub' ? 'bidding' : 'construction';
}

/** Stages where a bid due time means something: the open bids. */
export function isBidStage(stage: string): boolean {
  return stage === 'prospect' || stage === 'bidding';
}

/** The stages the bids pipeline shows, in funnel order (the database's bid_pipeline() uses the same four). */
export const PIPELINE_STAGES = ['prospect', 'bidding', 'awarded', 'lost'] as const satisfies readonly (typeof STAGES)[number]['value'][];

/** A stage's label, e.g. "Prospect". */
export function stageLabel(stage: string): string {
  return STAGES.find((s) => s.value === stage)?.label ?? stage;
}
