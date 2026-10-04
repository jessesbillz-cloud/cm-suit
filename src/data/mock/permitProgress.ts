// permit_progress in the e2e mock (0052, 0061), with the database's rules: ten places per permit (Inspected at 8);
// done, current, next, or failed (rejected at place 3; a cancelled permit where it stopped); complete is done
// everywhere; the days at a stage add up every visit, each counted on the job's clock (under 24 hours = 0, else
// calendar days, at least 1); undone moves never count; no time on the cancelled mark or the end.
import { formatInZone } from '../../lib/dates';
import type { PermitStep } from '../permits.types';
import type { StoredEvent, StoredPermit } from './permitSeeds';

const DAY = 86_400_000;

const PLACES = ['draft', 'submitted', 'accepted', 'in_review', 'comments_out', 'backcheck', 'issued', 'inspected', 'approved', 'complete'];

/** permit_stage_pos: rejected sits where accepted does; cancelled has no place. */
function stagePos(stage: string): number | null {
  if (stage === 'rejected') return 3;
  const i = PLACES.indexOf(stage);
  return i < 0 ? null : i + 1;
}

function calendarDay(iso: string, tz: string): number {
  return Date.parse(`${formatInZone(iso, tz, 'yyyy-MM-dd')}T12:00:00Z`);
}

function visitDays(from: string, to: string, tz: string): number {
  if (Date.parse(to) - Date.parse(from) < DAY) return 0;
  return Math.max(1, Math.round((calendarDay(to, tz) - calendarDay(from, tz)) / DAY));
}

interface Totals {
  entered: string;
  left: string | null;
  days: number;
}

function totals(events: readonly StoredEvent[], tz: string, now: string): Map<string, Totals> {
  const by = new Map<string, Totals>();
  events.forEach((e, i) => {
    const left = events[i + 1]?.at ?? null;
    const days = visitDays(e.at, left ?? now, tz);
    const t = by.get(e.stage);
    if (!t) {
      by.set(e.stage, { entered: e.at, left, days });
      return;
    }
    by.set(e.stage, { entered: t.entered, left: t.left === null || left === null ? null : left > t.left ? left : t.left, days: t.days + days });
  });
  return by;
}

/** One permit's ten places, from its (not undone) moves. */
export function permitSteps(p: StoredPermit, all: readonly StoredEvent[], tz: string, now: Date): PermitStep[] {
  const events = all.filter((e) => e.permit_id === p.id && !e.undone).sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
  const by = totals(events, tz, now.toISOString());
  const before = events[events.length - 2]?.stage ?? 'draft';
  const cur = p.stage === 'complete' ? 11 : p.stage === 'cancelled' ? (stagePos(before) ?? 1) : (stagePos(p.stage) ?? 1);
  return PLACES.map((place, i): PermitStep => {
    const pos = i + 1;
    const stage = p.stage === 'cancelled' && pos === cur ? 'cancelled' : pos === 3 && p.stage === 'rejected' ? 'rejected' : place;
    const failed = (p.stage === 'cancelled' || p.stage === 'rejected') && pos === cur;
    const state = failed ? 'failed' : pos < cur ? 'done' : pos === cur ? 'current' : 'next';
    const t = stage === 'complete' || stage === 'cancelled' ? undefined : by.get(stage);
    return {
      permit_id: p.id,
      position: pos,
      stage,
      state,
      entered_at: t?.entered ?? null,
      left_at: t?.left ?? null,
      days: t?.days ?? null,
    };
  });
}
