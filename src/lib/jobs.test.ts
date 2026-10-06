import { describe, expect, it } from 'vitest';
import {
  JOB_TOOLS,
  allJobsTool,
  defaultStage,
  isBidStage,
  isPinnedJobTool,
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
  it('All my jobs: only the cross-job tools some job of mine has on', () => {
    expect(railModel(null, [{ project_id: 'a', modules: ['bids', 'files', 'calendar'] }], {}, {})).toEqual({
      general: ['board', 'calendar', 'bids'],
      job: [],
      more: [],
    });
    expect(railModel(null, [{ project_id: 'a', modules: ['files'] }], {}, {})).toEqual({ general: ['board'], job: [], more: [] });
  });
  it("a job: nothing general; my recommendation there minus the Board under its name, the rest (its Board too) under More", () => {
    const rec = { a: ['board', 'calendar', 'rfis', 'inspections', 'files'] };
    expect(railModel('a', [{ project_id: 'a', modules: FIELD }], rec, {})).toEqual({
      general: [],
      job: ['calendar', 'rfis', 'inspections', 'files'],
      more: ['board', 'bids', 'dailies', 'deliveries', 'corrections', 'people'],
    });
  });
  it('a job: Files comes right after a recommendation without it, when the job has Files on', () => {
    const rec = { a: ['board', 'calendar', 'dailies', 'inspections', 'deliveries'] };
    expect(railModel('a', [{ project_id: 'a', modules: FIELD }], rec, {}).job).toEqual(['calendar', 'dailies', 'inspections', 'deliveries', 'files']);
    expect(railModel('a', [{ project_id: 'a', modules: FIELD }], {}, {}).job).toEqual(['files']);
    const noFiles = FIELD.filter((m) => m !== 'files');
    expect(railModel('a', [{ project_id: 'a', modules: noFiles }], rec, {}).job).toEqual(['calendar', 'dailies', 'inspections', 'deliveries']);
  });
  it('a job: my own list wins, in my order, on that job only (Edit decides, Files too); null is the default', () => {
    const jobs = [
      { project_id: 'a', modules: FIELD },
      { project_id: 'b', modules: FIELD },
    ];
    const rec = { a: ['board', 'rfis'], b: ['board', 'rfis'] };
    const own = { a: ['dailies', 'board', 'calendar'], b: null };
    expect(railModel('a', jobs, rec, own).job).toEqual(['dailies', 'board', 'calendar']);
    expect(railModel('a', jobs, rec, own).more).toEqual(['files', 'bids', 'inspections', 'rfis', 'deliveries', 'corrections', 'people']);
    expect(railModel('b', jobs, rec, own).job).toEqual(['rfis', 'files']);
  });
  it('a job: tools my role may not read show nowhere, not under More and not in my own list', () => {
    const jobs = [{ project_id: 'a', modules: FIELD }];
    expect(railModel('a', jobs, { a: ['bids'] }, {}, { a: ['board', 'bids'] })).toEqual({ general: [], job: ['bids'], more: ['board'] });
    expect(railModel('a', jobs, { a: ['bids'] }, { a: ['dailies', 'bids'] }, { a: ['board', 'bids'] }).job).toEqual(['bids']);
    // Not known yet: nothing hidden.
    expect(railModel('a', jobs, { a: ['bids'] }, {}, {}).more).toContain('dailies');
  });
  it('a job: a list naming tools the job has off shows each tool once; an empty list is a choice', () => {
    expect(jobRail(['dailies', 'bids', 'calendar', 'files', 'timesheets'], [], ['files', 'bids', 'calendar'])).toEqual({
      general: [],
      job: ['bids', 'calendar', 'files'],
      more: ['board', 'people'],
    });
    expect(jobRail([], ['board', 'rfis'], ['rfis'])).toEqual({ general: [], job: [], more: ['board', 'rfis', 'people'] });
  });
  it('a tool never shows twice, on either rail', () => {
    const jobs = [{ project_id: 'a', modules: [...FIELD, 'hours', 'permits'] }];
    const rec = { a: ['board', 'calendar', 'bids', 'permits', 'hours', 'files'] };
    for (const id of [null, 'a']) {
      const m = railModel(id, jobs, rec, {});
      const all = [...m.general, ...m.job, ...m.more];
      expect(new Set(all).size).toBe(all.length);
      const phone = phoneRail(m);
      expect(new Set(phone).size).toBe(phone.length);
    }
  });
  it('tools that are not modules are always on', () => {
    expect(toolIsOn('settings', [])).toBe(true);
    expect(toolIsOn('bids', ['files'])).toBe(false);
  });
  it("Hours: Timesheets on All my jobs for people who keep hours; on a job, Hours is a job tool like any other", () => {
    const jobs = [
      { project_id: 'v', modules: ['files', 'calendar', 'dailies', 'hours'] },
      { project_id: 'a', modules: FIELD },
    ];
    const keeper = { v: ['board', 'dailies', 'hours'], a: ['board'] };
    expect(toolIsOn('hours', ['files'])).toBe(false);
    expect(toolIsOn('timesheets', jobs[0]?.modules ?? [])).toBe(true);
    expect(railModel(null, jobs, keeper, {}).general).toEqual(['board', 'calendar', 'bids', 'timesheets']);
    expect(railModel('v', jobs, keeper, {})).toEqual({ general: [], job: ['dailies', 'hours', 'files'], more: ['board', 'calendar', 'people'] });
    const pm = { v: ['board', 'files'], a: ['board'] };
    expect(railModel(null, jobs, pm, {}).general).toEqual(['board', 'calendar', 'bids']);
    expect(railModel('v', jobs, pm, {})).toEqual({ general: [], job: ['files'], more: ['board', 'calendar', 'dailies', 'people', 'hours'] });
  });
  it("the phone: on a job, its Board then the job's tools; on All my jobs, the cross-job tools", () => {
    expect(phoneRail({ general: [], job: ['calendar', 'rfis', 'inspections'], more: ['board', 'files'] })).toEqual([
      'board',
      'calendar',
      'rfis',
      'inspections',
    ]);
    expect(phoneRail({ general: [], job: ['rfis', 'board', 'files'], more: [] })).toEqual(['board', 'rfis', 'files']);
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
  it("job tools: every rail tool but Timesheets, the job's own Board and Calendar too (the database's job_rail_tools)", () => {
    expect(JOB_TOOLS).toEqual([
      'board',
      'files',
      'bids',
      'calendar',
      'dailies',
      'inspections',
      'revs',
      'rfis',
      'permits',
      'deliveries',
      'corrections',
      'safety',
      'schedule',
      'requirements',
      'people',
      'hours',
    ]);
  });
  it("Permits: the caseload on All my jobs for the official whose position recommends it; on a job, a job tool", () => {
    const jobs = [
      { project_id: 's', modules: ['files', 'calendar', 'inspections', 'permits'] },
      { project_id: 'a', modules: FIELD },
    ];
    const official = { s: ['board', 'calendar', 'permits', 'inspections', 'files'], a: ['board'] };
    expect(railModel(null, jobs, official, {}).general).toEqual(['board', 'calendar', 'bids', 'permits']);
    expect(railModel('s', jobs, official, {})).toEqual({ general: [], job: ['calendar', 'permits', 'inspections', 'files'], more: ['board', 'people'] });
    const pm = { s: ['board', 'calendar', 'inspections', 'files'], a: ['board'] };
    expect(railModel(null, jobs, pm, {}).general).toEqual(['board', 'calendar', 'bids']);
    expect(railModel('s', jobs, pm, {})).toEqual({ general: [], job: ['calendar', 'inspections', 'files'], more: ['board', 'permits', 'people'] });
    expect(allJobsTool('permits')).toBe('permits');
  });
  it('Revs: a job tool right after Inspections, there only on jobs that have it on (OFS jobs)', () => {
    expect(JOB_TOOLS.indexOf('revs')).toBe(JOB_TOOLS.indexOf('inspections') + 1);
    expect(toolIsOn('revs', FIELD)).toBe(false);
    expect(toolIsOn('revs', [...FIELD, 'revs'])).toBe(true);
    const rec = ['board', 'calendar', 'inspections', 'revs', 'files'];
    expect(railModel('s', [{ project_id: 's', modules: ['files', 'calendar', 'inspections', 'revs'] }], { s: rec }, {}).job).toEqual([
      'calendar',
      'inspections',
      'revs',
      'files',
    ]);
    expect(railModel('a', [{ project_id: 'a', modules: FIELD }], { a: rec }, {}).job).toEqual(['calendar', 'inspections', 'files']);
  });
  it('Revs is pinned: under the job name for anyone who may read it, even when the position or my list leaves it out', () => {
    const s = [{ project_id: 's', modules: ['files', 'calendar', 'inspections', 'revs'] }];
    const pm = { s: ['board', 'calendar', 'inspections', 'files'] };
    expect(railModel('s', s, pm, {}).job).toEqual(['calendar', 'inspections', 'files', 'revs']);
    expect(railModel('s', s, pm, { s: ['files'] }).job).toEqual(['files', 'revs']);
    expect(railModel('s', s, pm, { s: ['files'] }).more).not.toContain('revs');
    expect(railModel('s', s, pm, {}, { s: ['board', 'files'] }).job).toEqual(['files']);
    expect(isPinnedJobTool('revs')).toBe(true);
    expect(isPinnedJobTool('files')).toBe(false);
  });
  it('Safety: a job tool after Corrections, on for jobs being built (0060), after Dailies for the field positions', () => {
    expect(JOB_TOOLS.indexOf('safety')).toBe(JOB_TOOLS.indexOf('corrections') + 1);
    expect(toolIsOn('safety', FIELD)).toBe(false);
    expect(toolIsOn('safety', [...FIELD, 'safety'])).toBe(true);
    const field = ['board', 'calendar', 'dailies', 'safety', 'inspections', 'deliveries'];
    expect(railModel('j', [{ project_id: 'j', modules: [...FIELD, 'safety'] }], { j: field }, {}).job).toEqual([
      'calendar',
      'dailies',
      'safety',
      'inspections',
      'deliveries',
      'files',
    ]);
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
