// A photo in the viewer: the whole picture fitted to the box. A tap (or click) zooms in on it and a second tap goes back
// to the fit; + and - step, two fingers pinch, the wheel zooms; a zoomed picture is dragged to pan. The picture is
// never cropped at the fit.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ImageIcon } from 'lucide-react';
import { Icon } from '../Icon';
import { useBoxSize } from './useBoxSize';
import { clampPan, clampZoom, TAP_ZOOM } from './zoom';
import { ZoomBar } from './ZoomBar';

interface ImageViewProps {
  url: string;
  name: string;
  tone: 'dark' | 'light';
}

/** A press that moves less than this (CSS pixels) is a tap, not a drag. */
const TAP_SLOP = 8;

type Drag = { id: number; x0: number; y0: number; pan0: { x: number; y: number }; moved: boolean };

type Pinch = { d0: number; z0: number };

const spread = (pts: Map<number, { x: number; y: number }>) => {
  const [a, b] = [...pts.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};

export function ImageView({ url, name, tone }: ImageViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const [zoom, setZoomState] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const drag = useRef<Drag | null>(null);
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<Pinch | null>(null);
  const zoomNow = useRef(zoom);

  const setZoom = (z: number) => {
    zoomNow.current = z;
    setZoomState(z);
    setPan((p) => clampPan(p, size, z));
  };

  // The wheel (or a trackpad's pinch) zooms; the page under the viewer never scrolls with it.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const z = clampZoom(zoomNow.current * Math.exp(-e.deltaY * 0.0015));
      zoomNow.current = z;
      setZoomState(z);
      setPan((p) => clampPan(p, { w: el.clientWidth, h: el.clientHeight }, z));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size === 2) {
      // A second finger: a pinch, never a tap or a drag.
      pinch.current = { d0: spread(fingers.current), z0: zoom };
      drag.current = null;
      return;
    }
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pan0: pan, moved: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && fingers.current.size === 2) {
      if (p.d0 > 0) setZoom(clampZoom((p.z0 * spread(fingers.current)) / p.d0));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    d.moved = true;
    if (zoom > 1) setPan(clampPan({ x: d.pan0.x + dx, y: d.pan0.y + dy }, size, zoom));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    if (pinch.current) {
      if (fingers.current.size === 0) pinch.current = null;
      return;
    }
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
        onPointerCancel={(e) => {
          fingers.current.delete(e.pointerId);
          if (fingers.current.size === 0) pinch.current = null;
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
