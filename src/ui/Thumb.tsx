// The one photo preview: the picture, cropped to fill its box (rounded, object-cover), over a light skeleton while it
// loads; the photo icon only when it can't be shown (refused, not an image, or the picture failed to load). The URL
// comes from data/preview (a short-lived signed URL, only for an image the person may see).
import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { useImageUrl, type PreviewVia } from '../data/preview';
import { Icon } from './Icon';

/** A grid of square photo tiles: three across, four from sm up. */
export const PHOTO_GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-4';
/** A square photo box with a hairline edge, holding a fill Thumb (and maybe a PHOTO_REMOVE). */
export const PHOTO_BOX = 'relative block aspect-square w-full overflow-hidden rounded-lg bg-page ring-1 ring-black/10';
/** The same box as a button (one click downloads): the accent ring on hover. */
export const PHOTO_TILE = `${PHOTO_BOX} transition-shadow hover:ring-2 hover:ring-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;
/** A short line on a tile's bottom edge (a time), white on a dark fade so it reads on any picture. */
export const PHOTO_TILE_LABEL =
  'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-5 text-left text-[11px] font-medium leading-4 tabular-nums text-white';
/** The round X in a tile's top-right corner. */
export const PHOTO_REMOVE =
  'absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-card/95 text-ink-2 shadow-control hover:text-danger';

interface ThumbProps {
  fileId: string;
  /** Opened through an RFI or an inspection request (their own access rules); leave out for a file in a folder. */
  via?: PreviewVia | undefined;
  /** What the photo shows (caption or file name), for screen readers. */
  alt: string;
  /** Fill the positioned box it sits in (a tile with badges on top); otherwise className sizes it. */
  fill?: boolean | undefined;
  /** The box's size and shape, e.g. 'aspect-square w-full'. The picture fills it. */
  className?: string | undefined;
  iconSize?: number | undefined;
}

export function Thumb({ fileId, via, alt, fill = false, className = '', iconSize = 22 }: ThumbProps) {
  const preview = useImageUrl(fileId, via);
  // Per URL, so a fresh URL starts over: loaded shows the picture, failed shows the icon.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const url = preview.data ?? null;
  const broken = preview.isError || (url !== null && failed === url);
  const shown = url !== null && loaded === url && !broken;

  return (
    <span className={`${fill ? 'absolute inset-0' : 'relative'} block overflow-hidden rounded-lg bg-page ${className}`} data-testid="thumb">
      {broken ? (
        <span className="absolute inset-0 flex items-center justify-center text-ink-3">
          <Icon icon={ImageIcon} size={iconSize} label={alt} />
        </span>
      ) : null}
      {!broken && !shown ? <span aria-hidden className="absolute inset-0 animate-pulse bg-line/60" /> : null}
      {url !== null && !broken ? (
        <img
          key={url}
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => {
            setLoaded(url);
          }}
          onError={() => {
            setFailed(url);
          }}
        />
      ) : null}
    </span>
  );
}
