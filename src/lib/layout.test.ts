import { describe, expect, it } from 'vitest';
import {
  LAYOUT_DEFAULTS,
  NOTIFY_AREAS,
  areaState,
  isTool,
  moveRailItem,
  parseLayout,
  phoneTabs,
  pushRecent,
  setNotify,
} from './layout';

const QUIET = ['task_assigned', 'task_signature', 'task_due_soon', 'rfi_answers', 'impact_claims', 'ir_results'];

function area(key: string) {
  const a = NOTIFY_AREAS.find((x) => x.key === key);
  if (!a) throw new Error(`no area ${key}`);
  return a;
}

describe('layout', () => {
  it('returns the defaults when there is no row', () => {
    expect(parseLayout(null)).toEqual(LAYOUT_DEFAULTS);
  });
  it('drops bad values', () => {
    const l = parseLayout({ main_default: 'nope', collapsed: { rail: true, right: 1 } });
    expect(l.main_default).toBe('board');
    expect(l.collapsed).toEqual({ rail: true, right: false });
  });
  it('old pins in a saved row are never read (retired in 0051: each job has its own tools)', () => {
    expect(parseLayout({ rail_items: ['files', 'board'] })).not.toHaveProperty('rail_items');
    expect(LAYOUT_DEFAULTS).not.toHaveProperty('rail_items');
  });
  it('keeps recent jobs most-recent-first without duplicates', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'z')).toHaveLength(8);
  });
  it('knows its tools', () => {
    expect(isTool('files')).toBe(true);
    expect(isTool('rfis')).toBe(true);
    expect(isTool('not-a-tool')).toBe(false);
  });
  it('phone bar: first four tools, the open one always on it, the rest under More', () => {
    const rail = ['board', 'files', 'bids', 'calendar', 'dailies', 'inspections'] as const;
    expect(phoneTabs(rail, 'board')).toEqual({ tabs: ['board', 'files', 'bids', 'calendar'], more: ['dailies', 'inspections', 'settings'] });
    expect(phoneTabs(rail, 'dailies')).toEqual({ tabs: ['board', 'files', 'bids', 'dailies'], more: ['calendar', 'inspections', 'settings'] });
    expect(phoneTabs(rail, 'settings').more).toEqual(['dailies', 'inspections', 'settings']);
  });
  it("phone bar: the job's other tools join More; one opened from there takes the last tab", () => {
    const rail = ['board', 'calendar', 'rfis', 'inspections', 'files'] as const;
    const others = ['dailies', 'people'] as const;
    expect(phoneTabs(rail, 'board', others)).toEqual({
      tabs: ['board', 'calendar', 'rfis', 'inspections'],
      more: ['files', 'dailies', 'people', 'settings'],
    });
    expect(phoneTabs(rail, 'dailies', others).tabs).toEqual(['board', 'calendar', 'rfis', 'dailies']);
    expect(phoneTabs(['bids'], 'board', ['board', 'files'])).toEqual({ tabs: ['bids', 'board'], more: ['files', 'settings'] });
  });
  it('phone bar: a tool in both lists shows once', () => {
    const rail = ['board', 'calendar', 'rfis', 'inspections', 'files', 'dailies'] as const;
    expect(phoneTabs(rail, 'rfis', ['board', 'dailies', 'people']).more).toEqual(['files', 'dailies', 'people', 'settings']);
  });
});

describe('rail order', () => {
  const rail = ['board', 'files', 'bids', 'calendar'] as const;
  it('moves a tool up or down one place', () => {
    expect(moveRailItem(rail, 'bids', -1)).toEqual(['board', 'bids', 'files', 'calendar']);
    expect(moveRailItem(rail, 'files', 1)).toEqual(['board', 'bids', 'files', 'calendar']);
  });
  it('does nothing past either end or for a tool not on the rail', () => {
    expect(moveRailItem(rail, 'board', -1)).toEqual([...rail]);
    expect(moveRailItem(rail, 'calendar', 1)).toEqual([...rail]);
    expect(moveRailItem(rail, 'people', -1)).toEqual([...rail]);
  });
  it('a moved tool reaches the phone bar', () => {
    const next = moveRailItem(['board', 'files', 'bids', 'calendar', 'dailies'], 'dailies', -1);
    expect(phoneTabs(next, 'board').tabs).toEqual(['board', 'files', 'bids', 'dailies']);
  });
});

describe('notification tree', () => {
  it('every event key is unique and every area has events', () => {
    const keys = NOTIFY_AREAS.flatMap((a) => a.events.map((e) => e.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of NOTIFY_AREAS) expect(a.events.length).toBeGreaterThan(0);
  });
  it('defaults to the quiet set: my tasks, answers to my RFIs, impact claims, my IR results', () => {
    expect(LAYOUT_DEFAULTS.notification_kinds).toEqual(QUIET);
    expect(parseLayout({}).notification_kinds).toEqual(QUIET);
  });
  it('maps saved keys from before the tree: tasks becomes every task event, the rest keep their meaning', () => {
    const saved = ['transmittals', 'tasks', 'addenda', 'ir_results', 'impact_claims', 'rfi_answers', 'nope'];
    expect(parseLayout({ notification_kinds: saved }).notification_kinds).toEqual([
      'task_assigned',
      'task_signature',
      'task_due_soon',
      'rfi_answers',
      'impact_claims',
      'ir_results',
      'addenda',
      'transmittals',
    ]);
    // The column default from before the tree is exactly the quiet set.
    expect(parseLayout({ notification_kinds: ['tasks', 'rfi_answers', 'impact_claims', 'ir_results'] }).notification_kinds).toEqual(QUIET);
  });
  it('a parent is all, some (indeterminate) or none of its children', () => {
    expect(areaState(area('tasks'), QUIET)).toBe('all');
    expect(areaState(area('inspections'), QUIET)).toBe('some');
    expect(areaState(area('rfis'), QUIET)).toBe('some');
    expect(areaState(area('deliveries'), QUIET)).toBe('none');
  });
  it('a parent box sets all of its children; a mixed parent turns them all on', () => {
    const rfis = area('rfis');
    const keys = rfis.events.map((e) => e.key);
    const allOn = setNotify(QUIET, keys, areaState(rfis, QUIET) !== 'all');
    expect(areaState(rfis, allOn)).toBe('all');
    expect(allOn).toEqual(['task_assigned', 'task_signature', 'task_due_soon', 'rfi_asked', 'rfi_answers', 'impact_claims', 'ir_results']);
    const allOff = setNotify(allOn, keys, false);
    expect(areaState(rfis, allOff)).toBe('none');
    expect(allOff).toEqual(['task_assigned', 'task_signature', 'task_due_soon', 'ir_results']);
  });
  it('a child box turns one event on or off, in tree order, and expands a legacy key', () => {
    expect(setNotify(['ir_results'], ['delivery_standby'], true)).toEqual(['ir_results', 'delivery_standby']);
    expect(setNotify(['tasks'], ['task_due_soon'], false)).toEqual(['task_assigned', 'task_signature']);
    expect(areaState(area('tasks'), setNotify(['tasks'], ['task_due_soon'], false))).toBe('some');
  });
});
