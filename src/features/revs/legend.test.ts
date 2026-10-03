import { describe, expect, it } from 'vitest';
import { parseLegend } from './legend';

/** As OSFM writes it (synthetic trades). */
const OSFM = `Rev. 0 - TOW
TOW - Speed Plugs (Sample Firestop)

Rev. 1 - HOW- Cavity
HOW Cavity Stuff (Sample Firestop)
HOW - Cavity Spray (Sample Firestop)
HOW - Beam Pockets (Sample Firestop)
Rev 2 – CJ
  CJ - Stuffing (Sample Firestop)
  CJ - Caulking
Rev. 4 - In-Wall
In-Wall -HVAC Controls (Sample Air & Controls)
Rev 7: Final
Final - OK to Cover - All firestopping/fireproofing (Sample GC)
`;

describe('parseLegend', () => {
  it('reads the legend as OSFM writes it: revs, items under them, the company in parentheses optional', () => {
    const r = parseLegend(OSFM);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.revs.map((v) => [v.number, v.name, v.items.length])).toEqual([
      [0, 'TOW', 1],
      [1, 'HOW- Cavity', 3],
      [2, 'CJ', 2],
      [4, 'In-Wall', 1],
      [7, 'Final', 1],
    ]);
    expect(r.revs[0]?.items[0]).toEqual({ name: 'TOW - Speed Plugs', company: 'Sample Firestop' });
    expect(r.revs[2]?.items[1]).toEqual({ name: 'CJ - Caulking', company: null });
    expect(r.revs[3]?.items[0]).toEqual({ name: 'In-Wall -HVAC Controls', company: 'Sample Air & Controls' });
    expect(r.revs[4]?.items[0]?.name).toBe('Final - OK to Cover - All firestopping/fireproofing');
  });

  it('takes items after the rev name and a colon, split by semicolons, and bullets in front of items', () => {
    const r = parseLegend(
      'Legend\nRev. 0 - TOW            : TOW - Speed Plugs (Firestop sub)\nRev 3 - Drywall : First Side - First Layer; First Side - Fire Tape\n' +
        '   Second Side - First Layer; Second Side - Fire Tape (Drywall sub)\nRev 4 - In-Wall\n- In-Wall Electrical\n• In-Wall Plumbing\n2) In-Wall HVAC',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.revs.map((v) => v.name)).toEqual(['TOW', 'Drywall', 'In-Wall']);
    expect(r.revs[1]?.items.map((i) => i.name)).toEqual([
      'First Side - First Layer',
      'First Side - Fire Tape',
      'Second Side - First Layer',
      'Second Side - Fire Tape',
    ]);
    expect(r.revs[1]?.items[3]?.company).toBe('Drywall sub');
    expect(r.revs[2]?.items.map((i) => i.name)).toEqual(['In-Wall Electrical', 'In-Wall Plumbing', 'In-Wall HVAC']);
  });

  it('refuses garbage with a short message naming the line', () => {
    expect(parseLegend('')).toEqual({ ok: false, error: 'Paste the legend.' });
    expect(parseLegend('  \n\n')).toEqual({ ok: false, error: 'Paste the legend.' });
    expect(parseLegend('Hello there\nRev 0 - TOW\nx')).toEqual({ ok: false, error: 'Line 1: start with a rev, like "Rev 0 - TOW".' });
    expect(parseLegend('Rev 0 - TOW\nSpeed Plugs\nRev 1\nStuff')).toEqual({ ok: false, error: 'Line 3: name the rev.' });
    expect(parseLegend('Rev 0 - TOW\nA\n\nRev 0 - HOW\nB')).toEqual({ ok: false, error: 'Line 4: Rev 0 is in twice.' });
    expect(parseLegend('Rev 0 - TOW\nA\nRev 1 - HOW\nRev 2 - CJ\nC')).toEqual({ ok: false, error: 'Line 3: Rev 1 has no items.' });
    expect(parseLegend('Rev 0 - TOW\n(Sample Firestop)')).toEqual({ ok: false, error: 'Line 2: name the item.' });
    expect(parseLegend('Rev 0 - TOW\nSpeed Plugs\nspeed plugs')).toEqual({ ok: false, error: 'Line 3: "speed plugs" is in Rev 0 twice.' });
    expect(parseLegend(`Rev 0 - TOW\n${'x'.repeat(121)}`)).toEqual({ ok: false, error: 'Line 2: keep item names to 120 characters.' });
    expect(parseLegend(`Rev 0 - ${'x'.repeat(81)}\nA`)).toEqual({ ok: false, error: 'Line 1: keep rev names to 80 characters.' });
  });

  it('keeps to the database limits: 50 revs, 50 items a rev', () => {
    const many = Array.from({ length: 51 }, (_, n) => `Rev ${String(n)} - R${String(n)}\nItem`).join('\n');
    expect(parseLegend(many)).toEqual({ ok: false, error: 'Line 101: up to 50 revs.' });
    const items = ['Rev 0 - TOW', ...Array.from({ length: 51 }, (_, n) => `Item ${String(n)}`)].join('\n');
    expect(parseLegend(items)).toEqual({ ok: false, error: 'Line 52: up to 50 items in a rev.' });
  });
});
