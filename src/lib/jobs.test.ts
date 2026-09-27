import { describe, expect, it } from 'vitest';
import { defaultStage, isBidStage, railForJob, toolIsOn } from './jobs';

describe('jobs', () => {
  it('a switched-off module leaves the rail; board and people always stay', () => {
    const rail = ['board', 'files', 'bids', 'calendar', 'people'];
    expect(railForJob(rail, ['files'])).toEqual(['board', 'files', 'people']);
    expect(railForJob(rail, [])).toEqual(['board', 'people']);
    expect(railForJob(rail, null)).toEqual(rail);
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
  });
});
