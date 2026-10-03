// The signature pad on the sign-in page, phone first: a big white box twice as wide as tall, a finger or a mouse draws,
// Clear starts over. The strokes are kept as fractions of the box (signature.ts), so the app and the PDF draw them the
// same at any size. The strokes being drawn live in a ref (no re-render per point); each finished stroke goes up.
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser } from 'lucide-react';
import type { Signature } from '../../data/safety.types';
import { Button } from '../../ui/Button';
import { canStartStroke, farEnough, hasRoom, padPoint, PAD_ASPECT } from './signature';

interface SignaturePadProps {
  value: Signature;
  onChange: (strokes: Signature) => void;
  testId: string;
}

const INK = '#111827';

export function SignaturePad({ value, onChange, testId }: SignaturePadProps) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<[number, number][][]>(value.map((s) => s.map(([x, y]): [number, number] => [x, y])));
  const active = useRef(false);

  const pen = useCallback((): { ctx: CanvasRenderingContext2D; w: number; h: number } | null => {
    const c = canvas.current;
    const ctx = c?.getContext('2d') ?? null;
    if (!c || !ctx) return null;
    const w = c.clientWidth;
    const h = c.clientHeight;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = Math.max(2, w / 160);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return { ctx, w, h };
  }, []);

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const p = pen();
    if (!p) return;
    p.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of strokes.current) {
      const [first, ...rest] = s;
      if (!first) continue;
      p.ctx.beginPath();
      p.ctx.moveTo(first[0] * p.w, first[1] * p.h);
      if (rest.length === 0) p.ctx.lineTo(first[0] * p.w + 0.1, first[1] * p.h + 0.1);
      for (const [x, y] of rest) p.ctx.lineTo(x * p.w, y * p.h);
      p.ctx.stroke();
    }
  }, [pen]);

  // Cleared from outside (the next person): start over.
  useEffect(() => {
    if (value.length === 0 && strokes.current.length > 0) {
      strokes.current = [];
      redraw();
    }
  }, [value, redraw]);

  useEffect(() => {
    const b = box.current;
    if (!b) return undefined;
    const ro = new ResizeObserver(() => {
      redraw();
    });
    ro.observe(b);
    return () => {
      ro.disconnect();
    };
  }, [redraw]);

  function at(e: ReactPointerEvent<HTMLDivElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    return padPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  }

  function segment(a: readonly [number, number], b: readonly [number, number]) {
    const p = pen();
    if (!p) return;
    p.ctx.beginPath();
    p.ctx.moveTo(a[0] * p.w, a[1] * p.h);
    p.ctx.lineTo(b[0] * p.w + (a === b ? 0.1 : 0), b[1] * p.h + (a === b ? 0.1 : 0));
    p.ctx.stroke();
  }

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!canStartStroke(strokes.current)) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      active.current = true;
      const p = at(e);
      strokes.current = [...strokes.current, [p]];
      segment(p, p);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!active.current) return;
      const stroke = strokes.current[strokes.current.length - 1];
      if (!stroke) return;
      const p = at(e);
      const last = stroke[stroke.length - 1];
      if (!farEnough(last, p) || !hasRoom(strokes.current, stroke.length)) return;
      stroke.push(p);
      if (last) segment(last, p);
    },
    onPointerUp: () => {
      if (!active.current) return;
      active.current = false;
      onChange(strokes.current.map((s) => [...s]));
    },
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={box}
        role="img"
        aria-label="Signature pad"
        data-testid={testId}
        className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-line-strong bg-white shadow-control"
        style={{ aspectRatio: `${String(PAD_ASPECT)} / 1` }}
        {...handlers}
        onPointerCancel={handlers.onPointerUp}
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-[26%] border-b border-dashed border-line-strong" />
        {value.length === 0 ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-[8%] text-center text-sm text-ink-3">Sign here</span>
        ) : null}
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      </div>
      <Button
        size="sm"
        variant="quiet"
        icon={Eraser}
        className="self-end"
        disabled={value.length === 0}
        data-testid={`${testId}-clear`}
        onClick={() => {
          strokes.current = [];
          redraw();
          onChange([]);
        }}
      >
        Clear
      </Button>
    </div>
  );
}
