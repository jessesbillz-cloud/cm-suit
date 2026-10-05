// A photo in the viewer: the whole picture fitted to the box. A tap (or click) zooms in on it and a second tap goes back
// to the fit; + and - step; a zoomed picture is dragged to pan. The picture is never cropped at the fit.
import { useRef, useState, type PointerEvent } from 'react';
import { ImageIcon } from 'lucide-react';
import { Icon } from '../Icon';
import { useBoxSize } from './useBoxSize';
import { clampPan, TAP_ZOOM } from './zoom';
import { ZoomBar } from './ZoomBar';

interface ImageViewProps {
  url: string;
  name: string;
  tone: 'dark' | 'light';
}

/** A press that moves less than this (CSS pixels) is a tap, not a drag. */
const TAP_SLOP = 8;

type Drag = { id: number; x0: number; y0: number; pan0: { x: number; y: number }; moved: boolean };

export function ImageView({ url, name, tone }: ImageViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const [zoom, setZoomState] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const drag = useRef<Drag | null>(null);

  const setZoom = (z: number) => {
    setZoomState(z);
    setPan((p) => clampPan(p, size, z));
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pan0: pan, moved: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    d.moved = true;
    if (zoom > 1) setPan(clampPan({ x: d.pan0.x + dx, y: d.pan0.y + dy }, size, zoom));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || d.moved) return;
    setZoom(zoom > 1 ? 1 : TAP_ZOOM);
  };

  if (failed) {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-2 text-sm ${tone === 'dark' ? 'text-white/80' : 'text-ink-2'}`}>
        <Icon icon={ImageIcon} size={32} />
        This picture did not load.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={box}
        data-testid="viewer-image"
        className={`h-full w-full touch-none select-none overflow-hidden ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          src={url}
          alt={name}
          draggable={false}
          className="h-full w-full object-contain transition-transform duration-150 ease-out"
          style={{ transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(zoom)})` }}
          onError={() => {
            setFailed(true);
          }}
        />
      </div>
      <ZoomBar zoom={zoom} onZoom={setZoom} tone={tone} />
    </div>
  );
}
