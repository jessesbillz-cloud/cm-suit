// Photos onto a report (SPEC §7.7): Camera (straight to the camera, several shots in a row) and Upload (photos only).
// Never a third button. Each photo is compressed by the one compressor with the job and time burned in, then handed
// to the upload queue by the caller: no save step.
import { useRef } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import type { PhotoPick } from '../../data/dailies.mutations';
import { messageOf } from '../../data/errors';
import { compressPhoto } from '../../lib/compressPhoto';
import { formatInZone } from '../../lib/dates';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

interface PhotoButtonsProps {
  projectName: string;
  tz: string;
  onPicked: (picks: PhotoPick[]) => void;
  /** Field mode and the tool screen: one big Camera button. */
  big?: boolean | undefined;
  /** A work-log row: a small camera icon only. */
  compact?: boolean | undefined;
  /** Hide Upload (the tool screen offers the camera only). */
  cameraOnly?: boolean | undefined;
  disabled?: boolean | undefined;
  testId?: string | undefined;
}

async function prepare(files: File[], projectName: string, tz: string): Promise<PhotoPick[]> {
  return Promise.all(
    files.map(async (f, i) => {
      const takenAt = f.lastModified > 0 ? f.lastModified : Date.now();
      const when = new Date(takenAt);
      const blob = await compressPhoto(f, `${projectName} · ${formatInZone(when, tz, 'MMM d, yyyy h:mm a')}`);
      const suffix = files.length > 1 ? ` (${String(i + 1)})` : '';
      const name = `Photo ${formatInZone(when, tz, 'yyyy-MM-dd HH.mm.ss')}${suffix}.jpg`;
      return { file: new File([blob], name, { type: 'image/jpeg', lastModified: takenAt }), takenAt };
    }),
  );
}

export function PhotoButtons({ projectName, tz, onPicked, big, compact, cameraOnly, disabled, testId }: PhotoButtonsProps) {
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const toast = useToast();

  function take(list: FileList | null) {
    const picked = [...(list ?? [])];
    if (picked.length === 0) return;
    prepare(picked, projectName, tz).then(onPicked, (e: unknown) => {
      toast.show({ tone: 'error', message: `Photo not added: ${messageOf(e)}` });
    });
  }

  const inputs = (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        data-testid={testId ? `${testId}-camera-input` : undefined}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={upload}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );

  if (compact) {
    return (
      <>
        <button
          type="button"
          aria-label="Photo for this row"
          disabled={disabled}
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink disabled:text-ink-3"
          onClick={() => {
            camera.current?.click();
          }}
        >
          <Icon icon={Camera} size={18} />
        </button>
        {inputs}
      </>
    );
  }

  return (
    <div className={`flex gap-2 ${big ? 'flex-col' : ''}`}>
      <Button
        variant={big ? 'primary' : 'secondary'}
        icon={Camera}
        disabled={disabled}
        className={big ? 'h-14 w-full text-base' : ''}
        data-testid={testId}
        onClick={() => {
          camera.current?.click();
        }}
      >
        Camera
      </Button>
      {cameraOnly ? null : (
        <Button
          icon={ImagePlus}
          disabled={disabled}
          className={big ? 'h-11 w-full' : ''}
          onClick={() => {
            upload.current?.click();
          }}
        >
          Upload
        </Button>
      )}
      {inputs}
    </div>
  );
}
