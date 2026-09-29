// Camera (phone) and Upload, and the picked photos as thumbnails with their upload state (SPEC §7.7: never three
// buttons). Previews come from the local file; the stored copy is the compressed one.
import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle, RotateCw, Upload, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PHOTO_BOX, PHOTO_GRID, PHOTO_REMOVE } from '../../ui/Thumb';
import type { PhotoUploads, PickedPhoto } from './usePhotoUploads';

interface ThumbProps {
  photo: PickedPhoto;
  onRemove: () => void;
  onRetry: () => void;
}

function LocalThumb({ photo, onRemove, onRetry }: ThumbProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(photo.file);
    setUrl(u);
    return () => {
      URL.revokeObjectURL(u);
    };
  }, [photo.file]);

  return (
    <li className={PHOTO_BOX} data-testid="cn-picked-photo">
      {url ? <img src={url} alt={photo.file.name} className="h-full w-full object-cover" /> : null}
      {photo.status === 'uploading' ? (
        <span className="absolute inset-0 flex items-center justify-center bg-card/60">
          <Icon icon={LoaderCircle} size={18} className="animate-spin text-ink-2" label="Uploading" />
        </span>
      ) : null}
      {photo.status === 'failed' ? (
        <button
          type="button"
          title={photo.error ?? undefined}
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-danger-soft py-1 text-xs text-danger"
          onClick={onRetry}
        >
          <Icon icon={RotateCw} size={12} />
          Retry
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Remove photo"
        className={PHOTO_REMOVE}
        onClick={onRemove}
      >
        <Icon icon={X} size={14} />
      </button>
    </li>
  );
}

interface PhotoPickerProps {
  uploads: PhotoUploads;
  isPhone: boolean;
  /** The Upload input's test id (each module's e2e names its own). */
  inputTestId?: string | undefined;
}

export function PhotoPicker({ uploads, isPhone, inputTestId = 'cn-photo-input' }: PhotoPickerProps) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  function take(input: HTMLInputElement) {
    const picked = [...(input.files ?? [])];
    input.value = '';
    if (picked.length > 0) uploads.add(picked);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {isPhone ? (
          <Button
            icon={Camera}
            disabled={uploads.full}
            onClick={() => {
              camera.current?.click();
            }}
          >
            Camera
          </Button>
        ) : null}
        <Button
          icon={Upload}
          disabled={uploads.full}
          onClick={() => {
            picker.current?.click();
          }}
        >
          Upload
        </Button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          take(e.target);
        }}
      />
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid={inputTestId}
        onChange={(e) => {
          take(e.target);
        }}
      />
      {uploads.photos.length > 0 ? (
        <ul className={PHOTO_GRID}>
          {uploads.photos.map((p) => (
            <LocalThumb
              key={p.key}
              photo={p}
              onRemove={() => {
                uploads.remove(p.key);
              }}
              onRetry={() => {
                uploads.retry(p.key);
              }}
            />
          ))}
        </ul>
      ) : null}
      {uploads.problem ? <p className="text-sm text-danger">{uploads.problem}</p> : null}
    </div>
  );
}
