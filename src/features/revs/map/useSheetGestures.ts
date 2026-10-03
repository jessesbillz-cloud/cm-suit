// Fingers, mouse and pen on the sheet. Two fingers always pan and zoom (pinch); one finger, the mouse or a pen draws
// when drawing is on, and pans otherwise. A second finger cancels the stroke the first one started (it was a pinch),
// and after a pinch the finger left behind pans until all are lifted. While a pen draws, the palm is ignored. The
// wheel zooms around the pointer.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { clampView, pinchView, toPage, zoomAt, type Pt, type Size, type View } from './viewport';

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; id: number; start: Pt; view0: View }
  | { kind: 'pinch'; a: number; b: number; a0: Pt; b0: Pt; view0: View }
  | { kind: 'draw'; id: number; pen: boolean; last: Pt; points: [number, number][] };

/** A new point every 2 CSS pixels at most: smooth lines, few points. */
const MIN_STEP = 2;

interface Options {
  frameRef: RefObject<HTMLDivElement | null>;
  fit: Size;
  frame: Size;
  view: View;
  setView: (update: (v: View) => View) => void;
  /** One finger / the mouse / a pen draws. */
  drawing: boolean;
  onStroke: (points: [number, number][]) => void;
}

function localPoint(frame: HTMLDivElement | null, e: { clientX: number; clientY: number }): Pt {
  const r = frame?.getBoundingClientRect();
  return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
}

export function useSheetGestures({ frameRef, fit, frame, view, setView, drawing, onStroke }: Options) {
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const viewNow = useRef(view);
  const [live, setLive] = useState<[number, number][] | null>(null);

  useEffect(() => {
    viewNow.current = view;
  }, [view]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = localPoint(el, e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      setView((v) => zoomAt(v, p.x, p.y, Math.exp(-delta * 0.0015), fit, frame));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [frameRef, fit, frame, setView]);

  const panFrom = (id: number, at: Pt) => {
    gesture.current = { kind: 'pan', id, start: at, view0: viewNow.current };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.kind === 'draw' && g.pen && e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const at = localPoint(frameRef.current, e);
    pointers.current.set(e.pointerId, at);
    if (pointers.current.size === 2) {
      const [[a, a0], [b, b0]] = [...pointers.current.entries()] as [[number, Pt], [number, Pt]];
      gesture.current = { kind: 'pinch', a, b, a0, b0, view0: viewNow.current };
      setLive(null);
      return;
    }
    if (pointers.current.size > 2 || g.kind !== 'idle') return;
    if (drawing && e.button === 0) {
      gesture.current = { kind: 'draw', id: e.pointerId, pen: e.pointerType === 'pen', last: at, points: [toPage(viewNow.current, fit, at.x, at.y)] };
      setLive(gesture.current.points.slice());
      return;
    }
    panFrom(e.pointerId, at);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const at = localPoint(frameRef.current, e);
    pointers.current.set(e.pointerId, at);
    const g = gesture.current;
    if (g.kind === 'pinch') {
      const a1 = pointers.current.get(g.a);
      const b1 = pointers.current.get(g.b);
      if (a1 && b1) setView(() => pinchView(g.view0, g.a0, g.b0, a1, b1, fit, frame));
    } else if (g.kind === 'pan' && g.id === e.pointerId) {
      setView(() => clampView({ x: g.view0.x + at.x - g.start.x, y: g.view0.y + at.y - g.start.y, z: g.view0.z }, fit, frame));
    } else if (g.kind === 'draw' && g.id === e.pointerId && Math.hypot(at.x - g.last.x, at.y - g.last.y) >= MIN_STEP) {
      g.last = at;
      g.points.push(toPage(viewNow.current, fit, at.x, at.y));
      setLive(g.points.slice());
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (g.kind === 'draw' && g.id === e.pointerId) {
      gesture.current = { kind: 'idle' };
      setLive(null);
      // A cancelled pointer (the browser took over) leaves no stroke.
      if (e.type !== 'pointercancel') onStroke(g.points);
      return;
    }
    const [rest] = [...pointers.current.entries()];
    if (rest === undefined) gesture.current = { kind: 'idle' };
    else if (g.kind === 'pinch') panFrom(rest[0], rest[1]);
  };

  return {
    live,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  };
}
