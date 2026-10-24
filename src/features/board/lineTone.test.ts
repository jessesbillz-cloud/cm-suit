import { describe, expect, it } from 'vitest';
import { STATUS } from '../../lib/status';
import { lineLook } from './lineTone';
import { filterKinds } from './boardKinds';

const MDR = { ofs: false, result: 'not_approved', fromMdr: true };

describe('board line look', () => {
  it('colors what happened: approved green, not approved and returned red, waiting yellow, sent blue', () => {
    expect(lineLook('ofs.approved')).toEqual({ type: 'OFS', tone: 'approved', word: 'Approved' });
    expect(lineLook('ofs.not_approved')).toEqual({ type: 'OFS', tone: 'not_approved', word: 'Not approved' });
    expect(lineLook('ir.returned')).toEqual({ type: 'IR', tone: 'not_approved', word: 'Returned' });
    expect(lineLook('rfi.asked')).toEqual({ type: 'RFI', tone: 'pending', word: 'Asked' });
    expect(lineLook('ir.requested')).toEqual({ type: 'IR', tone: 'assigned', word: 'Requested' });
    expect(lineLook('correction.opened').type).toBe('CN');
  });
  it("reads an IR's results from the request, and calls an OFS request's lines OFS", () => {
    expect(lineLook('ir.results', MDR)).toEqual({ type: 'IR', tone: 'not_approved', word: 'Not approved' });
    expect(lineLook('ir.results', { ...MDR, result: 'approved' }).tone).toBe('approved');
    expect(lineLook('ir.results')).toEqual({ type: 'IR', tone: 'info', word: 'Results' });
    expect(lineLook('ir.moved', { ...MDR, ofs: true }).type).toBe('OFS');
    expect(lineLook('ir.ofs_proposed').type).toBe('OFS');
  });
  it('a line that only tells is gray with no chip; impact claimed keeps the amber row', () => {
    expect(lineLook('member.joined')).toEqual({ type: 'People', tone: 'info', word: null });
    expect(lineLook('daily.submitted')).toEqual({ type: 'Daily', tone: 'info', word: null });
    expect(lineLook('something.new')).toEqual({ type: 'Note', tone: 'info', word: null });
    expect(lineLook('rfi.impact_claimed').tone).toBe('impact');
  });
  it('every server kind has a type word and a tone lib/status knows (or the amber row)', () => {
    for (const k of filterKinds([])) {
      const look = lineLook(k);
      expect(look.type, k).not.toBe('Note');
      if (look.tone !== 'impact') expect(STATUS[look.tone], k).toBeDefined();
    }
  });
});
