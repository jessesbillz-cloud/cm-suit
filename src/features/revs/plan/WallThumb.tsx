// Where a wall is, on its page: a small piece of its plan sheet around the wall, the wall's line in the accent color and
// an arrow at it. A tap opens the plan centered on it. Managers redraw it there, or place on the plan a wall that isn't
// on it yet (rev_area_place, from the plan with ?place=).
import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { RevArea, WallLine } from '../../../data/revs.types';
import { usePlanSheetUrl } from '../../../data/sheetUrl';
import { Button } from '../../../ui/Button';
import { renderRegion, type PDFPageProxy } from '../map/pdfjs';
import { useSheetPage } from '../map/useSheetPage';
import { cappedDensity } from '../map/viewport';
import { useWidth } from '../wall3d/useWidth';
import { cropAround, midpoint, type Box, type Pt } from './planGeom';

interface WallThumbProps {
  projectId: string;
  area: RevArea;
  canManage: boolean;
  isPhone: boolean;
  onShow: () => void;
  onPlace: () => void;
}

/** The thumbnail's height: a strip under the callout on a phone, beside it on a desktop. */
const height = (isPhone: boolean) => (isPhone ? 96 : 100);

/** The crop's points in thumbnail pixels. */
function inThumb(p: Pt, crop: Box, w: number, h: number): Pt {
  return [((p[0] - crop.x) / crop.w) * w, ((p[1] - crop.y) / crop.h) * h];
}

function Pointer({ line, crop, w, h, aspect }: { line: WallLine; crop: Box; w: number; h: number; aspect: number }) {
  const m = midpoint(line, aspect);
  const [mx, my] = inThumb(m.at, crop, w, h);
  // The arrow comes from the side with more room (toward the middle of the thumbnail).
  let [nx, ny] = [-m.dir[1], m.dir[0]];
  if ((w / 2 - mx) * nx + (h / 2 - my) * ny < 0) [nx, ny] = [-nx, -ny];
  const head: Pt = [mx + nx * 7, my + ny * 7];
  const tail: Pt = [mx + nx * 40, my + ny * 40];
  const wing = (s: number): Pt => [head[0] + nx * 11 + ny * 6.5 * s, head[1] + ny * 11 - nx * 6.5 * s];
  const pts = line.map((p) => inThumb(p, crop, w, h).join(',')).join(' ');
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${String(w)} ${String(h)}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts} fill="none" className="stroke-accent" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={tail[0]} y1={tail[1]} x2={head[0]} y2={head[1]} stroke="#fff" strokeWidth={6} strokeLinecap="round" />
      <line x1={tail[0]} y1={tail[1]} x2={head[0]} y2={head[1]} className="stroke-ink" strokeWidth={2.5} strokeLinecap="round" />
      <polygon points={[head, wing(1), wing(-1)].map((p) => p.join(',')).join(' ')} className="fill-ink" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

interface ThumbSheetProps {
  page: PDFPageProxy;
  aspect: number;
  line: WallLine;
  w: number;
  h: number;
}

function ThumbSheet({ page, aspect, line, w, h }: ThumbSheetProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const crop = cropAround(line, aspect, h / w);
  const fitW = w / crop.w;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const region = { x: crop.x * fitW, y: crop.y * fitW * aspect, w, h };
    const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const job = renderRegion(page, canvas, fitW, region, cappedDensity(w * h, ratio, 2_000_000));
    job.done.then(
      (ok) => {
        if (ok) setDrawn(true);
      },
      (e: unknown) => {
        console.warn('the plan thumbnail did not draw', e);
        setFailed(true);
      },
    );
    return job.cancel;
  }, [page, aspect, crop.x, crop.y, fitW, w, h]);
  if (failed) return <span className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-3">Plan didn't draw.</span>;
  return (
    <>
      <canvas ref={ref} aria-hidden className={`absolute inset-0 h-full w-full bg-white ${drawn ? '' : 'animate-pulse'}`} />
      <Pointer line={line} crop={crop} w={w} h={h} aspect={aspect} />
    </>
  );
}

/** A sheet that won't open says so here; the plan it opens has Retry. */
function ThumbBody({ url, area, w, h }: { url: string; area: RevArea; w: number; h: number }) {
  const { sheet } = useSheetPage(url, area.sheet_page);
  if (sheet.status === 'error') return <span className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-2">Plan didn't open.</span>;
  if (sheet.status !== 'ready' || !area.geom) return <span className="absolute inset-0 animate-pulse bg-page" />;
  return <ThumbSheet page={sheet.page} aspect={sheet.aspect} line={area.geom} w={w} h={h} />;
}

export function WallThumb({ projectId, area, canManage, isPhone, onShow, onPlace }: WallThumbProps) {
  const [frame, width] = useWidth(isPhone ? 340 : 260);
  const placed = area.geom !== null && area.sheet_file_id !== null;
  const url = usePlanSheetUrl(projectId, placed ? area.sheet_file_id : null);
  if (!placed) {
    return canManage ? (
      <Button icon={MapPin} size={isPhone ? 'lg' : 'md'} className={isPhone ? 'w-full' : ''} onClick={onPlace} data-testid="rev-wall-place">
        Place on plan
      </Button>
    ) : null;
  }
  return (
    <div className={`flex flex-col gap-1 ${isPhone ? 'w-full' : 'w-[260px] shrink-0'}`}>
      <div ref={frame}>
        <button
          type="button"
          aria-label="Show on the plan"
          className="relative block w-full overflow-hidden rounded-lg border border-line bg-page shadow-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ height: height(isPhone) }}
          data-testid="rev-wall-thumb"
          onClick={onShow}
        >
          {url.isError ? (
            <span className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-2">Plan didn't open.</span>
          ) : url.data ? (
            <ThumbBody url={url.data.url} area={area} w={Math.round(width)} h={height(isPhone)} />
          ) : (
            <span className="absolute inset-0 animate-pulse bg-page" />
          )}
        </button>
      </div>
      {canManage ? (
        <button type="button" className="self-end text-[13px] font-medium text-accent hover:underline" data-testid="rev-wall-redraw" onClick={onPlace}>
          Redraw
        </button>
      ) : null}
    </div>
  );
}
