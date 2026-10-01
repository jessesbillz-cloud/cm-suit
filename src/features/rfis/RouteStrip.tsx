// The ONE route strip (Jesse, Sep 30), in every RFI log row and at the top of the RFI pane: a small cell per step of the
// RFI's own route, from the person who wrote it to the answer. Done: a check, who, how long it sat there ("PE · 1d").
// Has it now: filled in the accent, with how long so far ("Architect · 5d", "You · 2d"). Ahead: an empty outline.
// Answered: solid green with a check. Colors from lib/status only; days from the server (the job's clock).
// 'line' puts the time beside the label (wide rows); 'stack' puts it under (the phone, the right column).
import { Check } from 'lucide-react';
import type { RfiProgressRow, RouteState } from '../../data/rfis.types';
import { Icon } from '../../ui/Icon';
import { cellLook, cellText, cellTitle } from './progress';

interface RouteStripProps {
  steps: readonly RfiProgressRow[];
  timeZone: string;
  /** The step that has it now is mine: it says "You". */
  mine?: boolean | undefined;
  layout: 'line' | 'stack';
  testId?: string | undefined;
}

const SPOKEN: Record<RouteState, string> = { done: 'done', current: 'now', next: 'ahead' };

interface CellProps {
  step: RfiProgressRow;
  timeZone: string;
  mine: boolean;
  layout: 'line' | 'stack';
}

function Cell({ step, timeZone, mine, layout }: CellProps) {
  const look = cellLook(step);
  const { label, time } = cellText(step, mine);
  const k = look.status;
  const fill = look.solid ? `var(--status-${k}-solid)` : `var(--status-${k}-bg)`;
  const ink = look.solid ? `var(--status-${k}-on-solid)` : `var(--status-${k}-fg)`;
  const edge = look.solid ? fill : `var(--status-${k}-dot)`;
  const stack = layout === 'stack';
  // Words wrap only at spaces, and "PM / PE" stays one piece.
  const [first = '', ...more] = label.replace(/ \/ /g, '\u00a0/\u00a0').split(' ');
  const rest = more.join(' ');
  // 'line': one line, as wide as its words. 'stack': the time under the label, and a long label wraps between words
  // (never cut), so a long route still fits a narrow column.
  return (
    <span
      role="listitem"
      data-state={step.state}
      data-kind={step.kind}
      title={cellTitle(step, timeZone)}
      className={`flex flex-1 items-center justify-center rounded-[5px] font-medium leading-[14px] ${
        stack ? 'min-h-[34px] flex-col px-1 py-[3px] text-center text-[11px]' : 'h-6 min-w-fit gap-1 whitespace-nowrap px-1.5 text-[11.5px]'
      }`}
      style={{ color: ink, background: fill, boxShadow: `inset 0 0 0 1px ${edge}` }}
    >
      <span>
        {/* The check stays with the first word; a long label wraps only after it. */}
        <span className="whitespace-nowrap">
          {look.check ? <Icon icon={Check} size={12} className="-mt-0.5 mr-0.5 inline-block align-middle" /> : null}
          {first}
        </span>
        {rest === '' ? null : ` ${rest}`}
      </span>
      {time !== '' ? (
        <span className={`whitespace-nowrap font-normal tabular-nums ${stack ? '' : 'opacity-90'}`}>
          {stack ? time : `· ${time}`}
        </span>
      ) : null}
      <span className="sr-only">{`, ${SPOKEN[step.state]}`}</span>
    </span>
  );
}

export function RouteStrip({ steps, timeZone, mine = false, layout, testId = 'rfi-strip' }: RouteStripProps) {
  if (steps.length === 0) return null;
  return (
    // Spans with list roles: the strip also sits inside a log row's button, which takes phrasing content only.
    // relative: the cells' screen-reader text is absolutely positioned and must stay inside the strip's scroll box.
    <span
      role="list"
      aria-label="Route"
      data-testid={testId}
      className={`relative flex w-full min-w-0 overflow-x-auto ${layout === 'stack' ? 'gap-[2px]' : 'gap-[3px]'}`}
    >
      {steps.map((s) => (
        <Cell key={s.position} step={s} timeZone={timeZone} mine={mine} layout={layout} />
      ))}
    </span>
  );
}
