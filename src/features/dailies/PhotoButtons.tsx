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

/**
 * field: Field Mode's big Camera over Upload. hero: the tool screen's Camera beside the main button (no Upload).
 * row: a work-log row's camera icon. plain: Camera and Upload side by side.
 */
type PhotoButtonsVariant = 'field' | 'hero' | 'row' | 'plain';

interface PhotoButtonsProps {
  projectName: string;
  tz: string;
  onPicked: (picks: PhotoPick[]) => void;
  variant?: PhotoButtonsVariant | undefined;
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

export function PhotoButtons({ projectName, tz, onPicked, variant = 'plain', disabled, testId }: PhotoButtonsProps) {
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

  if (variant === 'row') {
    return (
      <>
        <button
          type="button"
          aria-label="Photo for this row"
          disabled={disabled}
          className="flex h-10 w-9 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink disabled:text-ink-3/50"
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

  const field = variant === 'field';
  const hero = variant === 'hero';
  const size = variant === 'plain' ? 'sm' : 'md';
  return (
    <div className={`flex gap-2 ${field ? 'flex-col' : ''} ${hero ? 'flex-1' : ''}`}>
      <Button
        variant={field ? 'primary' : 'secondary'}
        icon={Camera}
        size={size}
        disabled={disabled}
        className={field ? 'h-14 w-full text-base' : hero ? 'h-12 w-full text-base' : ''}
        data-testid={testId}
        onClick={() => {
          camera.current?.click();
        }}
      >
        Camera
      </Button>
      {hero ? null : (
        <Button
          icon={ImagePlus}
          size={size}
          disabled={disabled}
          className={field ? 'h-11 w-full' : ''}
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
