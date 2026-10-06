// The day's inspections on the inspector's daily (MDR "put the schedule on the report"; Jesse, Oct 5: "if there's a
// note for dailies about inspection request received or whatever, that should auto populate"). From daily_day_facts:
// each request received that day for another day, and each of the day's inspections, as one short line in
// content.inspections, only for the requests I decide. Each source goes in once (content.pulled): a line taken off
// stays off. A line follows its request (status, time, company) while it still reads as the app wrote it (`auto`);
// once edited it is the writer's. Generate IR writes the result over the day's line (0029, same ref, no `auto`), which
// is then left alone. A day's line whose request left the day (moved, withdrawn) goes, unless edited. Pure: unit-tested.
import type { DayFacts } from '../../data/dailies.types';
import type { DailyContent } from '../../lib/dailies';
import { formatDay } from '../../lib/dates';
import { decidesRequest, firstLine, requestChip, typeLabel } from '../inspections/model';
import { clockLabel } from '../inspections/time';

type Line = DailyContent['inspections'][number];
type Inspection = DayFacts['inspections'][number];
type Received = DayFacts['received'][number];

/** Which requests I decide (ir.decide; ir.ofs_decide on one with OFS). */
export interface Deciding {
  decide: boolean;
  ofsDecide: boolean;
}

/** "IR 12 IOR · 9:00 AM · Sample Framing: Pending. Shear walls" (the result line after Generate IR reads
 *  "IR 12 IOR: Approved. Shear walls"). */
export function dayLine(r: Inspection, ofsDecide = false): string {
  const what = firstLine(r.items);
  const head = `IR ${String(r.number)} ${typeLabel(r.kind, r.special)} · ${clockLabel(r.start_time)} · ${r.company}`;
  return `${head}: ${requestChip(r, ofsDecide).label}.${what === '' ? '' : ` ${what}`}`;
}

/** "IR 14 IOR requested for Thu, Oct 8, 9:00 AM · Sample Framing: Shear walls". */
export function receivedLine(r: Received): string {
  const what = firstLine(r.items);
  const when = `${formatDay(r.request_date, 'EEE, MMM d')}${r.start_time === null ? '' : `, ${clockLabel(r.start_time)}`}`;
  return `IR ${String(r.number)} ${typeLabel(r.kind, r.special)} requested for ${when} · ${r.company}${what === '' ? '' : `: ${what}`}`;
}

/** A line the app wrote and nobody has changed since. */
function untouched(l: Line): boolean {
  return l.auto !== undefined && l.text === l.auto;
}

/** The report's lines with the day filled in, or null when nothing changes. */
export function pullInspections(content: DailyContent, facts: DayFacts, can: Deciding): DailyContent | null {
  const mine = (r: { kind: string; ofs_sent: boolean }) => decidesRequest(r, can);
  const sources = new Map<string, string>([
    ...facts.received.filter(mine).map((r): [string, string] => [`irq:${r.id}`, receivedLine(r)]),
    ...facts.inspections.filter(mine).map((r): [string, string] => [`ir:${r.id}`, dayLine(r, can.ofsDecide)]),
  ]);
  const pulled = new Set(content.pulled);
  const gone = new Set<string>();
  let changed = false;
  const lines: Line[] = [];
  for (const l of content.inspections) {
    const text = sources.get(l.ref);
    if (untouched(l) && text === undefined && l.ref.startsWith('ir:')) {
      gone.add(l.ref);
      changed = true;
    } else if (untouched(l) && text !== undefined && text !== l.text) {
      lines.push({ ref: l.ref, text, auto: text });
      changed = true;
    } else {
      lines.push(l);
    }
  }
  const added: string[] = [];
  for (const [ref, text] of sources) {
    if (pulled.has(ref) && !gone.has(ref)) continue;
    added.push(ref);
    if (lines.some((l) => l.ref === ref)) continue;
    lines.push({ ref, text, auto: text });
    changed = true;
  }
  if (!changed && added.length === 0) return null;
  return {
    ...content,
    inspections: lines,
    pulled: [...content.pulled.filter((r) => !gone.has(r)), ...added],
  };
}
