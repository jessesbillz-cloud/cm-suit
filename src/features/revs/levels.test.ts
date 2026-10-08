import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, jobLevels, levelKey, onLevel, pickedLevel, planLevel, sameLevel } from './levels';

const at = (...levels: string[]) => levels.map((level) => ({ level }));

describe('levels', () => {
  it('one key whatever the case, spaces or leading zeros', () => {
    expect(levelKey(' Level  01 ')).toBe('level 1');
    expect(sameLevel('Level 1', 'level 01')).toBe(true);
    expect(sameLevel('Level 10', 'Level 1')).toBe(false);
    expect(sameLevel('Site', 'site ')).toBe(true);
  });

  it('every level once, in natural order, Site after the levels, spelled as most spell it', () => {
    expect(jobLevels(at('Level 10', 'Level 2', ' level 2 ', 'Level 2'))).toEqual(['Level 2', 'Level 10']);
    // The rated walls say "Level 01" (three times), the fire & life safety sheet "Level 1" (once).
    expect(jobLevels(at('Level 01', 'Level 01', 'Level 02', 'Level 01', 'Site', 'Level 1', 'Level 03'))).toEqual([
      'Level 01', 'Level 02', 'Level 03', 'Site',
    ]);
    expect(jobLevels([])).toEqual([]);
  });

  it('the level picked: the URL one as the job spells it, All, else the first', () => {
    const levels = ['Level 01', 'Level 02', 'Site'];
    expect(pickedLevel('level 2', levels)).toBe('Level 02');
    expect(pickedLevel(ALL_LEVELS, levels)).toBeNull();
    expect(pickedLevel(undefined, levels)).toBe('Level 01');
    expect(pickedLevel('Roof', levels)).toBe('Level 01');
    expect(pickedLevel(undefined, [])).toBeNull();
  });

  it("the plan's level: always one; a manager may start a new one", () => {
    const levels = ['Level 01', 'Level 02'];
    expect(planLevel(ALL_LEVELS, levels, true)).toBe('Level 01');
    expect(planLevel('Level 2', levels, false)).toBe('Level 02');
    expect(planLevel(' Roof ', levels, true)).toBe('Roof');
    expect(planLevel('Roof', levels, false)).toBe('Level 01');
    expect(planLevel(undefined, [], false)).toBeNull();
  });

  it('walls on a level; null is all of them', () => {
    const walls = at('Level 01', 'Level 1', 'Level 02');
    expect(onLevel(walls, 'Level 01')).toHaveLength(2);
    expect(onLevel(walls, null)).toHaveLength(3);
  });
});
