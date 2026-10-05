import { describe, expect, it } from 'vitest';
import { STATUS } from './status';
import {
  cleanSection,
  isOpenStatus,
  kindLabel,
  KIND_VALUES,
  REQUIREMENT_STATUSES,
  requiredLabel,
  statusOf,
  STATUS_VALUES,
} from './requirements';

describe('requirements lists', () => {
  it('the kinds the database checks (requirement_kind_ok), in its order', () => {
    expect(KIND_VALUES).toEqual([
      'ofci', 'ofoi', 'cfci', 'testing', 'witness', 'mfr_rep', 'warranty', 'training', 'attic_stock', 'closeout_doc', 'notice',
      'mockup', 'other',
    ]);
    expect(kindLabel('ofci')).toBe('OFCI');
    expect(kindLabel('mfr_rep')).toBe("Mfr's rep");
  });
  it('the statuses the database checks, each with a lib/status chip', () => {
    expect(STATUS_VALUES).toEqual(['open', 'requested', 'scheduled', 'done', 'waived', 'na']);
    for (const s of REQUIREMENT_STATUSES) expect(s.chip in STATUS).toBe(true);
    expect(statusOf('na').label).toBe('N/A');
    expect(statusOf('done').chip).toBe('approved');
  });
  it('open, requested and scheduled are still to do', () => {
    expect(STATUS_VALUES.filter(isOpenStatus)).toEqual(['open', 'requested', 'scheduled']);
  });
  it('required, optional or if applicable', () => {
    expect(requiredLabel('yes')).toBe('Required');
    expect(requiredLabel('if_applicable')).toBe('If applicable');
  });
  it('a section is spaced like the database keeps it', () => {
    expect(cleanSection('102800')).toBe('10 28 00');
    expect(cleanSection(' 01  78 23.13 ')).toBe('01 78 23.13');
    expect(cleanSection('284621.11')).toBe('28 46 21.11');
  });
});
