// Job and company choices: stages, company kinds and modules. The ONE place these lists and their labels live.
// The database checks stage and kind (projects.stage, orgs.kind); the modules default is the projects.modules column.
import { RAIL_TOOLS, type RailTool, type Tool } from './layout';

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
  // The fire marshal's walls and their revs (0056): on for OFS jobs being built.
  { value: 'revs', label: 'Revs' },
  { value: 'rfis', label: 'RFIs' },
  // For the fire / building official (0052): on for jobs being built.
  { value: 'permits', label: 'Permits' },
  { value: 'deliveries', label: 'Deliveries' },
  { value: 'corrections', label: 'Corrections' },
  // My hours on the job (0043): on for an inspector company's jobs; Timesheets (All my jobs) comes with it.
  { value: 'hours', label: 'Hours' },
] as const satisfies readonly { value: RailTool; label: string }[];

const MODULE_TOOLS: readonly string[] = MODULES.map((m) => m.value);

/** A tool that comes with another tool's module: Timesheets (all my jobs) is there where Hours is. */
const MODULE_OF: Readonly<Record<string, string>> = { timesheets: 'hours' };

/** Is this tool on for a job with these modules? */
export function toolIsOn(tool: string, modules: readonly string[]): boolean {
  const module = MODULE_OF[tool] ?? tool;
  return !MODULE_TOOLS.includes(module) || modules.includes(module);
}

/** The tools of a list that a job with these modules has on. */
export function railForJob<T extends string>(railItems: readonly T[], modules: readonly string[]): T[] {
  return railItems.filter((t) => toolIsOn(t, modules));
}

/**
 * The tools that work across every job ("All my jobs"): the board and calendar of all my jobs, the bids pipeline, the
 * official's permit caseload and my timesheets. The ONE list: they are the rail on All my jobs, never on a job (Jesse,
 * Oct 3: "once you're on a job, it should all be specific to that job"), and the job picker names them.
 */
export const ALL_JOBS_TOOLS = ['board', 'calendar', 'bids', 'permits', 'timesheets'] as const satisfies readonly RailTool[];

type AllJobsTool = (typeof ALL_JOBS_TOOLS)[number];

/**
 * A job's tools (the database's job_rail_tools(), 0058): every rail tool but Timesheets (All my jobs only; a job's own
 * hours are its Hours). The job's own Board and Calendar are job tools like any other. A new tool in RAIL_TOOLS (and in
 * job_rail_tools()) joins every job's list here, and its Edit list, by itself.
 */
export const JOB_TOOLS: readonly RailTool[] = RAIL_TOOLS.filter((t) => t !== 'timesheets');

function worksAcrossJobs(tool: string): tool is AllJobsTool {
  return (ALL_JOBS_TOOLS as readonly string[]).includes(tool);
}

/** The tools of a list that work across jobs, minus modules no job of mine has on. */
export function railForAllJobs<T extends string>(railItems: readonly T[], jobModules: readonly (readonly string[])[]): T[] {
  return railItems.filter((t) => worksAcrossJobs(t) && (toolIsOn(t, []) || jobModules.some((m) => toolIsOn(t, m))));
}

/**
 * The rail (Jesse, Oct 3): on All my jobs, the cross-job tools; on a job, only that job's: its tools in my order under
 * its name, then More for its other tools. One way to reach each tool.
 */
export interface RailModel {
  /** On All my jobs, the cross-job tools. None on a job. */
  general: RailTool[];
  /** On a job, its tools in my order. None on All my jobs. */
  job: RailTool[];
  /** The job's other tools, under More. */
  more: RailTool[];
}

/**
 * Cross-job tools only for the positions they are for: Timesheets for people who keep hours (my position recommends
 * Hours on some job of mine), Permits for the official whose position recommends it (everyone else finds a job's
 * Permits on the job).
 */
const TOP_FOR: Readonly<Record<string, string>> = { timesheets: 'hours', permits: 'permits' };

function recommendedSomewhere(tool: string, recommended: readonly (readonly string[])[]): boolean {
  const needs = TOP_FOR[tool];
  return needs === undefined || recommended.some((r) => r.includes(needs));
}

/** The rail on All my jobs: the cross-job tools some job of mine has on (Timesheets, Permits: see TOP_FOR). */
function allJobsRail(jobModules: readonly (readonly string[])[], recommended: readonly (readonly string[])[]): RailTool[] {
  return railForAllJobs(ALL_JOBS_TOOLS, jobModules).filter((t) => recommendedSomewhere(t, recommended));
}

/**
 * My tools on a job until I choose my own: my position's recommendation without the Board (the right column shows the
 * job's board beside every tool), then Files, so Files is one tap on every job (Jesse, Oct 3).
 */
function defaultJobTools(recommended: readonly string[]): string[] {
  const mine = recommended.filter((t) => t !== 'board');
  return mine.includes('files') ? mine : [...mine, 'files'];
}

/**
 * A job's rail. Under its name: my own list for this job (`choice`; Edit decides), else my default there (my position's
 * recommendation, my_recommended_tools, then Files), in that order. More: the job's other tools. A list may name tools
 * the job has off; they just don't show.
 */
export function jobRail(choice: readonly string[] | null, recommended: readonly string[], modules: readonly string[]): RailModel {
  const on = railForJob(JOB_TOOLS, modules);
  const chosen = choice ?? defaultJobTools(recommended);
  const job = on.filter((t) => chosen.includes(t)).sort((a, b) => chosen.indexOf(a) - chosen.indexOf(b));
  return { general: [], job, more: on.filter((t) => !job.includes(t)) };
}

interface RailJob {
  project_id: string;
  modules: readonly string[];
}

/**
 * The rail the frame shows: on All my jobs (`projectId` null) the cross-job tools; on a job, that job's part only.
 * `recommended` and `choices` are per job id (my_recommended_tools, user_job_rail; a missing id = none).
 */
export function railModel(
  projectId: string | null,
  jobs: readonly RailJob[],
  recommended: Readonly<Record<string, readonly string[]>>,
  choices: Readonly<Record<string, readonly string[] | null>>,
): RailModel {
  if (projectId === null) {
    const general = allJobsRail(
      jobs.map((j) => j.modules),
      jobs.map((j) => recommended[j.project_id] ?? []),
    );
    return { general, job: [], more: [] };
  }
  const modules = jobs.find((j) => j.project_id === projectId)?.modules ?? [];
  return jobRail(choices[projectId] ?? null, recommended[projectId] ?? [], modules);
}

/**
 * The phone bar's order (SPEC §7.7): on All my jobs, the cross-job tools; on a job, its Board first (the phone has no
 * right column, so the board is its home), then the job's tools in my order.
 */
export function phoneRail(m: RailModel): RailTool[] {
  if (m.general.length > 0) return [...m.general];
  return ['board', ...m.job.filter((t) => t !== 'board')];
}

/** Shows a tool under the job's name (it joins the end) or takes it off (it goes under More). */
export function showJobTool(chosen: readonly RailTool[], tool: RailTool, shown: boolean): RailTool[] {
  if (!shown) return chosen.filter((t) => t !== tool);
  return chosen.includes(tool) ? [...chosen] : [...chosen, tool];
}

/** Where a tool lands on "All my jobs": itself when it works across jobs (Settings too), a job's Hours on Timesheets, else the board. */
export function allJobsTool(tool: string): AllJobsTool | 'settings' {
  if (tool === 'settings') return 'settings';
  if (tool === 'hours') return 'timesheets';
  return worksAcrossJobs(tool) ? tool : 'board';
}

/** Where a tool lands on a job: itself, except Timesheets (all my jobs), which lands on the job's Hours. */
export function jobTool(tool: Tool): Tool {
  return tool === 'timesheets' ? 'hours' : tool;
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
