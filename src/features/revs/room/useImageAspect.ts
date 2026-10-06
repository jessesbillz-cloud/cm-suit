// A picture's height / width, read once per URL (the room viewer lays the picture out at its own shape).
import { useEffect, useState } from 'react';

type Aspect = { status: 'loading' } | { status: 'ready'; aspect: number } | { status: 'error' };

export function useImageAspect(url: string | null): Aspect {
  const [answer, setAnswer] = useState<{ url: string; value: Aspect } | null>(null);
  useEffect(() => {
    if (url === null) return undefined;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live) setAnswer({ url, value: img.naturalWidth > 0 ? { status: 'ready', aspect: img.naturalHeight / img.naturalWidth } : { status: 'error' } });
    };
    img.onerror = () => {
      if (live) setAnswer({ url, value: { status: 'error' } });
    };
    img.src = url;
    return () => {
      live = false;
    };
  }, [url]);
  return answer !== null && answer.url === url ? answer.value : { status: 'loading' };
}
