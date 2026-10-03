// An element's width in CSS pixels, kept current as it resizes (the 3-D wall sizes its label from it).
import { useLayoutEffect, useRef, useState } from 'react';

export function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    setWidth(el.getBoundingClientRect().width || initial);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [initial]);
  return [ref, width] as const;
}
