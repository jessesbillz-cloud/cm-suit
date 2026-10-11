import { describe, expect, it } from 'vitest';
import { againWhen, dayFor, parseLastWhen, startWhen } from './requestStart';

// 2026-10-09 is a Friday.
const FRIDAY = '2026-10-09';

describe('a new request prefilled', () => {
  it('starts an OFS request on the next working day, any other on the day looked at', () => {
    expect(dayFor('ofs', FRIDAY, FRIDAY)).toBe('2026-10-12');
    expect(dayFor('ior', FRIDAY, FRIDAY)).toBe(FRIDAY);
    expect(dayFor('special', '2026-10-01', FRIDAY)).toBe(FRIDAY);
    expect(dayFor('ofs', '2026-10-14', FRIDAY)).toBe('2026-10-14');
  });

  it('starts Flexible for 1 hr, or with the time and length last asked for here', () => {
    expect(startWhen('ofs', FRIDAY, FRIDAY, null)).toEqual({ date: '2026-10-12', time: 'flexible', duration: '60' });
    expect(startWhen('ior', FRIDAY, FRIDAY, { time: '07:30', duration: '120' })).toEqual({ date: FRIDAY, time: '07:30', duration: '120' });
  });

  it('reads back only a time and length still offered', () => {
    expect(parseLastWhen(null)).toBeNull();
    expect(parseLastWhen('{"time":"07:30","duration":"120"}')).toEqual({ time: '07:30', duration: '120' });
    expect(parseLastWhen('{"time":"flexible","duration":"all_day"}')).toEqual({ time: 'flexible', duration: 'all_day' });
    expect(parseLastWhen('{"time":"07:31","duration":"120"}')).toBeNull();
    expect(parseLastWhen('{"time":"07:30","duration":"7"}')).toBeNull();
    expect(parseLastWhen('{"time":"07:30"}')).toBeNull();
    expect(parseLastWhen('[]')).toBeNull();
    expect(parseLastWhen('null')).toBeNull();
    expect(parseLastWhen('not json')).toBeNull();
  });

  it('files another like this on the next working day, same time and length', () => {
    expect(againWhen({ date: FRIDAY, time: '09:00', duration: '90' })).toEqual({ date: '2026-10-12', time: '09:00', duration: '90' });
    expect(againWhen({ date: '2026-10-12', time: 'flexible', duration: '60' })).toEqual({ date: '2026-10-13', time: 'flexible', duration: '60' });
  });
});
