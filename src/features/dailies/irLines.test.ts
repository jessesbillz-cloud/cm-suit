import { describe, expect, it } from 'vitest';
import type { DayFacts } from '../../data/dailies.types';
import { dailyContentSchema, type DailyContent } from '../../lib/dailies';
import { dayLine, pullInspections, receivedLine } from './irLines';

const INSPECTOR = { decide: true, ofsDecide: false };
const DEPUTY = { decide: false, ofsDecide: true };

const IOR = {
  id: 'i1', number: 7, kind: 'ior', special: null, items: 'Shear walls\nlevel 2', start_time: '08:00', status: 'pending',
  result: null, helper_id: null, company: 'Sample Framing Co', ofs_sent: false,
};
const OFS_SENT = { ...IOR, id: 'i2', number: 8, kind: 'ofs', items: 'Rated corridor', start_time: null, ofs_sent: true };
const RECEIVED = {
  id: 'i3', number: 9, kind: 'special', special: 'Concrete', items: 'Footings', company: 'Sample Concrete Co',
  request_date: '2026-10-08', start_time: '09:30', ofs_sent: false,
};
const FACTS: DayFacts = { signins: [], meetings: [], deliveries: [], inspections: [IOR, OFS_SENT], received: [RECEIVED] };

function content(v: unknown = {}): DailyContent {
  return dailyContentSchema.parse(v);
}

function filled(c: DailyContent | null): DailyContent {
  if (c === null) throw new Error('expected lines');
  return dailyContentSchema.parse(c);
}

describe('the day\'s inspections on the inspector\'s daily', () => {
  it('words each line short, like the IR summary', () => {
    expect(dayLine(IOR)).toBe('IR 7 IOR · 8:00 AM · Sample Framing Co: Pending. Shear walls');
    expect(receivedLine(RECEIVED)).toBe('IR 9 Special: Concrete requested for Thu, Oct 8, 9:30 AM · Sample Concrete Co: Footings');
  });

  it('fills the requests received and the day\'s inspections I decide, once', () => {
    const c = filled(pullInspections(content(), FACTS, INSPECTOR));
    expect(c.inspections.map((l) => l.ref)).toEqual(['irq:i3', 'ir:i1']);
    expect(c.pulled).toEqual(['irq:i3', 'ir:i1']);
    expect(pullInspections(c, FACTS, INSPECTOR)).toBeNull();
    // The deputy gets the request with OFS, nothing else.
    expect(filled(pullInspections(content(), FACTS, DEPUTY)).inspections.map((l) => l.ref)).toEqual(['ir:i2']);
  });

  it('follows the request until edited; an edit and a removal stay', () => {
    const c = filled(pullInspections(content(), FACTS, INSPECTOR));
    const confirmed = { ...FACTS, inspections: [{ ...IOR, status: 'confirmed' }] };
    expect(filled(pullInspections(c, confirmed, INSPECTOR)).inspections[1]?.text).toBe(
      'IR 7 IOR · 8:00 AM · Sample Framing Co: Confirmed. Shear walls',
    );
    const edited = { ...c, inspections: c.inspections.map((l) => (l.ref === 'ir:i1' ? { ...l, text: 'IR 7 walked with the super' } : l)) };
    expect(pullInspections(edited, confirmed, INSPECTOR)).toBeNull();
    const removed = { ...c, inspections: c.inspections.filter((l) => l.ref !== 'irq:i3') };
    expect(pullInspections(removed, FACTS, INSPECTOR)).toBeNull();
  });

  it('leaves the IR result line alone and adds nothing beside it', () => {
    const result = content({ inspections: [{ ref: 'ir:i1', text: 'IR 7 IOR: Approved. Shear walls' }] });
    const c = filled(pullInspections(result, FACTS, INSPECTOR));
    expect(c.inspections).toEqual([{ ref: 'ir:i1', text: 'IR 7 IOR: Approved. Shear walls' }, expect.objectContaining({ ref: 'irq:i3' })]);
    expect(c.pulled).toContain('ir:i1');
  });

  it('takes a day\'s line off when its request leaves the day, unless edited', () => {
    const c = filled(pullInspections(content(), FACTS, INSPECTOR));
    const moved = { ...FACTS, inspections: [] };
    const after = filled(pullInspections(c, moved, INSPECTOR));
    expect(after.inspections.map((l) => l.ref)).toEqual(['irq:i3']);
    expect(after.pulled).toEqual(['irq:i3']);
    // Back on the day: it comes back.
    expect(filled(pullInspections(after, FACTS, INSPECTOR)).inspections.map((l) => l.ref)).toEqual(['irq:i3', 'ir:i1']);
  });

  it('never fills anything for someone who decides no requests', () => {
    expect(pullInspections(content(), FACTS, { decide: false, ofsDecide: false })).toBeNull();
  });
});
