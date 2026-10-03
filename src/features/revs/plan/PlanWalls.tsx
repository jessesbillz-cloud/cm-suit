// The walls over the plan sheet, in screen pixels so they keep their weight at any zoom: each wall a thick line in its
// state's color (lib/status; a white edge keeps it clear of the drawing under it) with its callout (the name; a tap
// opens the wall's page), the wall being looked at heavier, and the line being drawn with its points.
import type { PointerEvent } from 'react';
import type { PagePlace } from '../map/SheetStage';
import { midpoint, type Pt } from './planGeom';
import { placeLabels } from './planLabels';

export interface PlanWall {
  id: string;
  line: readonly Pt[];
  color: string;
  /** The callout: the wall's name without its grid brackets. */
  title: string;
}

interface PlanWallsProps {
  walls: readonly PlanWall[];
  place: PagePlace;
  aspect: number;
  /** The wall being looked at (from its page): drawn heavier, its label first. */
  focusId: string | null;
  /** The line being drawn, or null. */
  draft: readonly Pt[] | null;
  /** Labels open walls; off while drawing (a tap then is a point). */
  onOpen: ((id: string) => void) | null;
}

const pts = (line: readonly Pt[], place: PagePlace) => line.map((p) => place.toFrame(p).join(',')).join(' ');

/** A label's tap is the label's, not the start of a pan on the sheet under it. */
const keep = (e: PointerEvent) => {
  e.stopPropagation();
};

export function PlanWalls({ walls, place, aspect, focusId, draft, onOpen }: PlanWallsProps) {
  const ordered = [...walls].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId));
  const labels = placeLabels(
    ordered.map((w) => {
      const m = midpoint(w.line, aspect);
      return { id: w.id, text: w.title, at: place.toFrame(m.at), dir: m.dir };
    }),
    place.frame,
  );
  const byId = new Map(walls.map((w) => [w.id, w]));
  return (
    <>
      <svg className="absolute inset-0 h-full w-full" aria-hidden data-testid="plan-lines">
        {walls.map((w) => {
          const heavy = w.id === focusId;
          return (
            <g key={w.id} data-wall={w.id}>
              <polyline points={pts(w.line, place)} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={heavy ? 12 : 8.5} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={pts(w.line, place)} fill="none" stroke={w.color} strokeWidth={heavy ? 7 : 4.5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {labels.map((l) => (
          <line key={l.id} x1={l.at[0]} y1={l.at[1]} x2={l.tip[0]} y2={l.tip[1]} className="stroke-ink" strokeOpacity={0.5} strokeWidth={1} />
        ))}
        {draft && draft.length > 0 ? (
          <g data-testid="plan-draft">
            <polyline points={pts(draft, place)} fill="none" stroke="#fff" strokeWidth={8.5} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={pts(draft, place)} fill="none" className="stroke-accent" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
            {draft.map((p, i) => {
              const [x, y] = place.toFrame(p);
              return <circle key={i} cx={x} cy={y} r={5.5} fill="#fff" className="stroke-accent" strokeWidth={2.5} />;
            })}
          </g>
        ) : null}
      </svg>
      {labels.map((l) => {
        const w = byId.get(l.id);
        if (!w) return null;
        return (
          <button
            key={l.id}
            type="button"
            tabIndex={onOpen ? 0 : -1}
            data-testid={`plan-wall-${l.id}`}
            data-focus={l.id === focusId ? 'true' : undefined}
            className={`absolute flex items-start gap-1.5 rounded-md bg-card/95 px-2 py-1 text-left text-[12px] font-semibold leading-[15px] text-ink shadow-card ${
              onOpen ? 'pointer-events-auto hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent' : 'opacity-80'
            } ${l.id === focusId ? 'ring-2 ring-accent' : ''}`}
            style={{ left: l.box.x, top: l.box.y, width: l.box.w }}
            onPointerDown={keep}
            onClick={() => {
              onOpen?.(l.id);
            }}
          >
            <span aria-hidden className="mt-[4px] h-2 w-2 shrink-0 rounded-full" style={{ background: w.color }} />
            <span className="min-w-0 break-words">{w.title}</span>
          </button>
        );
      })}
    </>
  );
}
