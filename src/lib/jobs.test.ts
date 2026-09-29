import { describe, expect, it } from 'vitest';
import { allJobsRail, allJobsTool, defaultStage, isBidStage, jobRail, jobTool, railForAllJobs, railForJob, stageLabel, toolIsOn } from './jobs';

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
  it("a job's rail: my role's recommendation on the job, in its order; the rest of the job's tools under More", () => {
    const modules = ['files', 'calendar', 'dailies', 'inspections', 'rfis', 'deliveries', 'corrections'];
    expect(jobRail(null, ['board', 'calendar', 'dailies', 'inspections', 'corrections', 'files'], modules)).toEqual({
      rail: ['board', 'calendar', 'dailies', 'inspections', 'corrections', 'files'],
      more: ['rfis', 'deliveries', 'people'],
    });
  });
  it("a job's rail: pins win on every job, minus what the job has off; never empty", () => {
    expect(jobRail(['dailies', 'board', 'bids'], ['board', 'rfis'], ['dailies'])).toEqual({ rail: ['dailies', 'board'], more: ['people'] });
    expect(jobRail(null, ['nope', 'bids'], ['files'])).toEqual({ rail: ['board'], more: ['files', 'people'] });
    expect(jobRail(null, [], [])).toEqual({ rail: ['board'], more: ['people'] });
  });
  it('All my jobs: every cross-job tool some job has on; pins pick which stay on the rail', () => {
    expect(allJobsRail(null, [['bids', 'files', 'calendar']])).toEqual({ rail: ['board', 'calendar', 'bids'], more: [] });
    expect(allJobsRail(null, [['files']])).toEqual({ rail: ['board'], more: [] });
    expect(allJobsRail(['calendar', 'files', 'board'], [['bids', 'calendar']])).toEqual({ rail: ['calendar', 'board'], more: ['bids'] });
  });
  it('tools that are not modules are always on', () => {
    expect(toolIsOn('settings', [])).toBe(true);
    expect(toolIsOn('bids', ['files'])).toBe(false);
  });
  it('Hours: on where the job has it; Timesheets comes with it and never sits on a job', () => {
    const modules = ['files', 'dailies', 'hours'];
    expect(toolIsOn('hours', ['files'])).toBe(false);
    expect(toolIsOn('timesheets', modules)).toBe(true);
    expect(jobRail(null, ['board', 'dailies', 'hours'], modules)).toEqual({ rail: ['board', 'dailies', 'hours'], more: ['files', 'people'] });
    expect(jobRail(['hours', 'timesheets'], [], modules).rail).toEqual(['hours']);
  });
  it('All my jobs: Timesheets for people who keep hours on a job that has Hours', () => {
    const jobs = [['bids', 'calendar'], ['calendar', 'hours']];
    expect(allJobsRail(null, jobs, [['board'], ['board', 'hours']]).rail).toEqual(['board', 'calendar', 'bids', 'timesheets']);
    expect(allJobsRail(null, jobs, [['board'], ['board', 'calendar']]).rail).toEqual(['board', 'calendar', 'bids']);
    expect(allJobsRail(null, [['calendar']], [['board', 'hours']]).rail).toEqual(['board', 'calendar']);
    expect(allJobsRail(['board', 'hours'], jobs, [])).toEqual({ rail: ['board'], more: ['calendar', 'bids', 'timesheets'] });
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
