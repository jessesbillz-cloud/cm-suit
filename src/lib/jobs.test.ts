import { describe, expect, it } from 'vitest';
import {
  JOB_TOOLS,
  allJobsTool,
  defaultStage,
  isBidStage,
  jobRail,
  jobTool,
  phoneRail,
  railForAllJobs,
  railForJob,
  railModel,
  showJobTool,
  stageLabel,
  toolIsOn,
} from './jobs';

/** A job being built: every field tool on (0021). */
const FIELD = ['bids', 'files', 'calendar', 'dailies', 'inspections', 'rfis', 'deliveries', 'corrections'];

describe('jobs', () => {
  it('a switched-off module leaves the rail; board and people always stay', () => {
    const rail = ['board', 'files', 'bids', 'calendar', 'people'];
    expect(railForJob(rail, ['files'])).toEqual(['board', 'files', 'people']);
    expect(railForJob(rail, [])).toEqual(['board', 'people']);
  });
  it('All my jobs: only the tools that work across jobs, in my rail order', () => {
    const rail = ['calendar', 'files', 'dailies', 'bids', 'board', 'people'];
    expect(railForAllJobs(rail, [['bids', 'files', 'calendar', 'dailies']])).toEqual(['calendar', 'bids', 'board']);
    expect(railForAllJobs(['board', 'files'], [['bids', 'files', 'calendar']])).toEqual(['board']);
  });
  it('All my jobs: a module no job has on stays off; the board is always there', () => {
    const rail = ['board', 'bids', 'calendar'];
    expect(railForAllJobs(rail, [['files', 'calendar'], ['calendar']])).toEqual(['board', 'calendar']);
    expect(railForAllJobs(rail, [['files'], ['bids']])).toEqual(['board', 'bids']);
    expect(railForAllJobs(rail, [])).toEqual(['board']);
  });
  it('All my jobs: a job-only tool lands on the board; cross-job tools and Settings stay', () => {
    expect(allJobsTool('files')).toBe('board');
    expect(allJobsTool('dailies')).toBe('board');
    expect(allJobsTool('bids')).toBe('bids');
    expect(allJobsTool('calendar')).toBe('calendar');
    expect(allJobsTool('settings')).toBe('settings');
  });
  it('All my jobs: only the top, the cross-job tools some job of mine has on', () => {
    expect(railModel(null, [{ project_id: 'a', modules: ['bids', 'files', 'calendar'] }], {}, {})).toEqual({
      general: ['board', 'calendar', 'bids'],
      job: [],
      more: [],
    });
    expect(railModel(null, [{ project_id: 'a', modules: ['files'] }], {}, {})).toEqual({ general: ['board'], job: [], more: [] });
  });
  it("a job: the top acts on it; my recommendation there, minus the top, under its name; the rest under More", () => {
    const rec = { a: ['board', 'calendar', 'rfis', 'inspections', 'files'] };
    expect(railModel('a', [{ project_id: 'a', modules: FIELD }], rec, {})).toEqual({
      general: ['board', 'calendar', 'bids'],
      job: ['rfis', 'inspections', 'files'],
      more: ['dailies', 'deliveries', 'corrections', 'people'],
    });
  });
  it('a job: my own list wins, in my order, on that job only; null is the recommendation', () => {
    const jobs = [
      { project_id: 'a', modules: FIELD },
      { project_id: 'b', modules: FIELD },
    ];
    const rec = { a: ['board', 'rfis'], b: ['board', 'rfis'] };
    const own = { a: ['dailies', 'files'], b: null };
    expect(railModel('a', jobs, rec, own).job).toEqual(['dailies', 'files']);
    expect(railModel('a', jobs, rec, own).more).toEqual(['inspections', 'rfis', 'deliveries', 'corrections', 'people']);
    expect(railModel('b', jobs, rec, own).job).toEqual(['rfis']);
  });
  it("a job: a list naming tools the job has off, or ones on top, shows each tool once; an empty list is a choice", () => {
    expect(jobRail(['board', 'calendar', 'bids'], ['dailies', 'bids', 'calendar', 'files'], [], ['files', 'bids', 'calendar'])).toEqual({
      general: ['board', 'calendar', 'bids'],
      job: ['files'],
      more: ['people'],
    });
    expect(jobRail(['board'], [], ['board', 'rfis'], ['rfis'])).toEqual({ general: ['board'], job: [], more: ['rfis', 'people'] });
  });
  it('tools that are not modules are always on', () => {
    expect(toolIsOn('settings', [])).toBe(true);
    expect(toolIsOn('bids', ['files'])).toBe(false);
  });
  it("Hours: on top (as the job's Hours) for people who keep hours; a job's tool for everyone else", () => {
    const jobs = [
      { project_id: 'v', modules: ['files', 'calendar', 'dailies', 'hours'] },
      { project_id: 'a', modules: FIELD },
    ];
    const keeper = { v: ['board', 'dailies', 'hours'], a: ['board'] };
    expect(toolIsOn('hours', ['files'])).toBe(false);
    expect(toolIsOn('timesheets', jobs[0]?.modules ?? [])).toBe(true);
    expect(railModel(null, jobs, keeper, {}).general).toEqual(['board', 'calendar', 'bids', 'timesheets']);
    expect(railModel('v', jobs, keeper, {})).toEqual({ general: ['board', 'calendar', 'hours'], job: ['dailies'], more: ['files', 'people'] });
    expect(railModel('a', jobs, keeper, {}).general).toEqual(['board', 'calendar', 'bids']);
    const pm = { v: ['board', 'files'], a: ['board'] };
    expect(railModel(null, jobs, pm, {}).general).toEqual(['board', 'calendar', 'bids']);
    expect(railModel('v', jobs, pm, {})).toEqual({ general: ['board', 'calendar'], job: ['files'], more: ['dailies', 'people', 'hours'] });
  });
  it("the phone: Board and Calendar, then the job's tools, then the rest of the top", () => {
    expect(phoneRail({ general: ['board', 'calendar', 'bids'], job: ['rfis', 'inspections'], more: ['files'] })).toEqual([
      'board',
      'calendar',
      'rfis',
      'inspections',
      'bids',
    ]);
    expect(phoneRail({ general: ['board', 'calendar', 'bids', 'timesheets'], job: [], more: [] })).toEqual([
      'board',
      'calendar',
      'bids',
      'timesheets',
    ]);
  });
  it('Edit: a shown tool joins the end, a hidden one goes under More', () => {
    expect(showJobTool(['rfis'], 'files', true)).toEqual(['rfis', 'files']);
    expect(showJobTool(['rfis', 'files'], 'files', true)).toEqual(['rfis', 'files']);
    expect(showJobTool(['rfis', 'files'], 'rfis', false)).toEqual(['files']);
  });
  it("job tools: every rail tool but Board, Calendar and Timesheets (the database's job_rail_tools)", () => {
    expect(JOB_TOOLS).toEqual(['files', 'bids', 'dailies', 'inspections', 'rfis', 'permits', 'deliveries', 'corrections', 'people', 'hours']);
  });
  it("Permits: on top (the caseload, and the job's permits) for the official whose position recommends it; a job's tool for everyone else", () => {
    const jobs = [
      { project_id: 's', modules: ['files', 'calendar', 'inspections', 'permits'] },
      { project_id: 'a', modules: FIELD },
    ];
    const official = { s: ['board', 'calendar', 'permits', 'inspections', 'files'], a: ['board'] };
    expect(railModel(null, jobs, official, {}).general).toEqual(['board', 'calendar', 'bids', 'permits']);
    expect(railModel('s', jobs, official, {})).toEqual({ general: ['board', 'calendar', 'permits'], job: ['inspections', 'files'], more: ['people'] });
    expect(railModel('a', jobs, official, {}).general).toEqual(['board', 'calendar', 'bids']);
    const pm = { s: ['board', 'calendar', 'inspections', 'files'], a: ['board'] };
    expect(railModel(null, jobs, pm, {}).general).toEqual(['board', 'calendar', 'bids']);
    expect(railModel('s', jobs, pm, {})).toEqual({ general: ['board', 'calendar'], job: ['inspections', 'files'], more: ['permits', 'people'] });
    expect(allJobsTool('permits')).toBe('permits');
  });
  it('Hours and Timesheets land on each other between a job and All my jobs', () => {
    expect(allJobsTool('hours')).toBe('timesheets');
    expect(allJobsTool('timesheets')).toBe('timesheets');
    expect(jobTool('timesheets')).toBe('hours');
    expect(jobTool('dailies')).toBe('dailies');
  });
  it('prefills the stage from the company kind', () => {
    expect(defaultStage('gc')).toBe('bidding');
    expect(defaultStage('inspector')).toBe('construction');
    expect(isBidStage('bidding')).toBe(true);
    expect(isBidStage('construction')).toBe(false);
    expect(stageLabel('awarded')).toBe('Awarded');
  });
});
