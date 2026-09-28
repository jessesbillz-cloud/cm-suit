import { describe, expect, it } from 'vitest';
import { allJobsTool, defaultStage, isBidStage, railForAllJobs, railForJob, stageLabel, toolIsOn } from './jobs';

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
  it('tools that are not modules are always on', () => {
    expect(toolIsOn('settings', [])).toBe(true);
    expect(toolIsOn('bids', ['files'])).toBe(false);
  });
  it('prefills the stage from the company kind', () => {
    expect(defaultStage('gc')).toBe('bidding');
    expect(defaultStage('inspector')).toBe('construction');
    expect(isBidStage('bidding')).toBe(true);
    expect(isBidStage('construction')).toBe(false);
    expect(stageLabel('awarded')).toBe('Awarded');
  });
});
