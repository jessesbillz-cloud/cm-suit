// The viewer's zoom controls, floating at the bottom of what they zoom: -, +, Fit, and a PDF's "Page N of M". Finger
// sized at every width, phones and the right column's preview too (Jesse, Oct 5: "I need a zoom button on there on the
// viewers").
import { Minus, Plus, Scan } from 'lucide-react';
import { Icon } from '../Icon';
import { MAX_ZOOM, MIN_ZOOM, zoomStep } from './zoom';

interface ZoomBarProps {
  zoom: number;
  onZoom: (z: number) => void;
  /** "Page 2 of 14" for a PDF. */
  pageLabel?: string | undefined;
  /** Dark chrome (the full-screen viewer) or light (a pane's preview). */
  tone: 'dark' | 'light';
}

const BTN = 'flex h-10 w-10 items-center justify-center rounded-md disabled:opacity-40';

export function ZoomBar({ zoom, onZoom, pageLabel, tone }: ZoomBarProps) {
  const look =
    tone === 'dark' ? 'bg-black/70 text-white [&_button:hover]:bg-white/15' : 'bg-card text-ink-2 shadow-pop [&_button:hover]:bg-page';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
      <div data-testid="viewer-zoom" className={`pointer-events-auto flex items-center gap-1 rounded-lg px-1 py-1 text-sm tabular-nums ${look}`}>
        {pageLabel ? (
          <span data-testid="viewer-page" className="px-2">
            {pageLabel}
          </span>
        ) : null}
        <button type="button" className={BTN} aria-label="Zoom out" title="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => {
            onZoom(zoomStep(zoom, -1));
          }}>
          <Icon icon={Minus} size={18} />
        </button>
        <span className="w-12 text-center" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className={BTN} aria-label="Zoom in" title="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => {
            onZoom(zoomStep(zoom, 1));
          }}>
          <Icon icon={Plus} size={18} />
        </button>
        <button type="button" className={`${BTN} !w-auto gap-1.5 px-3 font-medium`} title="Fit" data-testid="viewer-fit" disabled={zoom === 1} onClick={() => {
            onZoom(1);
          }}>
          <Icon icon={Scan} size={16} />
          Fit
        </button>
      </div>
    </div>
  );
}
