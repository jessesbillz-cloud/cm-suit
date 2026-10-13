import { describe, expect, it } from 'vitest';
import { photoRequest, photoWall, photoWhen } from './photoLines';

describe('photoWhen', () => {
  it('says when (in the job time zone) and who', () => {
    expect(photoWhen({ created_at: '2026-10-12T22:04:00Z', by_name: 'Sample Sub' }, 'America/Los_Angeles')).toBe('Oct 12, 3:04 PM · Sample Sub');
  });
});

describe('photoRequest', () => {
  it('names the request it was added on', () => {
    expect(photoRequest({ request_id: 'r1', ir_number: 12 })).toBe('IR 12');
    expect(photoRequest({ request_id: null, ir_number: null })).toBeNull();
  });
});

describe('photoWall', () => {
  const names = new Map([['w1', 'North']]);
  it('names the wall when the list holds several, the room for the room own', () => {
    expect(photoWall({ area_id: 'w1' }, names)).toBe('North');
    expect(photoWall({ area_id: null }, names)).toBe('Room');
    expect(photoWall({ area_id: 'w1' }, null)).toBeNull();
  });
});
