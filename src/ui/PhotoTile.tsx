// A saved photo as a square tile (ui/Thumb): a tap opens it full screen (the file viewer, over its strip). Its corners
// hold Download (the original, one click) and, on a form, the X that takes it off (the caller's toast offers Undo).
// Every photo strip uses it, so a tap does the same thing everywhere.
import type { ReactNode } from 'react';
import { Download, LoaderCircle, X } from 'lucide-react';
import type { PreviewVia } from '../data/preview';
import { Icon } from './Icon';
import { PHOTO_REMOVE, PHOTO_TILE, PHOTO_TILE_LABEL, Thumb } from './Thumb';

const CORNER =
  'absolute right-1 flex h-7 w-7 items-center justify-center rounded-full bg-card/95 text-ink-2 shadow-control hover:text-accent';

interface PhotoTileProps {
  fileId: string;
  /** Opened through an RFI or an inspection request (their own gate); left out, the file's folder. */
  via?: PreviewVia | undefined;
  name: string;
  /** Opens the viewer on this photo. */
  onOpen: () => void;
  /** One-click Download in the corner (the bottom one when the tile also has its X). */
  onDownload?: (() => void) | undefined;
  downloading?: boolean | undefined;
  /** The X in the top corner (a form's tile). */
  onRemove?: (() => void) | undefined;
  /** A short line on the bottom edge (when it was added). */
  label?: ReactNode | undefined;
  testId?: string | undefined;
}

export function PhotoTile({ fileId, via, name, onOpen, onDownload, downloading = false, onRemove, label, testId }: PhotoTileProps) {
  return (
    <li className="relative" data-testid={testId}>
      <button type="button" title={name} aria-label={`Open ${name}`} data-testid="photo-open" className={PHOTO_TILE} onClick={onOpen}>
        <Thumb fileId={fileId} via={via} alt={name} fill />
        {label ? <span className={PHOTO_TILE_LABEL}>{label}</span> : null}
      </button>
      {onRemove ? (
        <button type="button" aria-label={`Remove ${name}`} className={PHOTO_REMOVE} onClick={onRemove}>
          <Icon icon={X} size={14} />
        </button>
      ) : null}
      {onDownload ? (
        <button
          type="button"
          aria-label={`Download ${name}`}
          title="Download"
          disabled={downloading}
          className={`${CORNER} ${onRemove ? 'bottom-1' : 'top-1'}`}
          onClick={onDownload}
        >
          <Icon icon={downloading ? LoaderCircle : Download} size={14} className={downloading ? 'animate-spin' : ''} />
        </button>
      ) : null}
    </li>
  );
}
