// Upload offers photo or file; phones also get Camera. Never three buttons (SPEC §7.7).
import { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { compressPhoto, jpegName } from '../../lib/compressPhoto';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

interface UploadButtonsProps {
  showCamera: boolean;
  onFiles: (files: File[]) => void;
}

async function compressAll(files: File[]): Promise<File[]> {
  return Promise.all(
    files.map(async (f) => new File([await compressPhoto(f)], jpegName(f.name), { type: 'image/jpeg', lastModified: f.lastModified })),
  );
}

export function UploadButtons({ showCamera, onFiles }: UploadButtonsProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  return (
    <>
      {showCamera ? (
        <>
          <Button icon={Camera} onClick={() => {
              cameraInput.current?.click();
            }}>
            Camera
          </Button>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = '';
              compressAll(picked)
                .then(onFiles)
                .catch((err: unknown) => {
                  toast.show({ tone: 'error', message: `Photo not added: ${messageOf(err)}` });
                });
            }}
          />
        </>
      ) : null}
      <Button variant="primary" icon={Upload} onClick={() => {
          fileInput.current?.click();
        }}>
        Upload
      </Button>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = '';
          if (picked.length > 0) onFiles(picked);
        }}
      />
    </>
  );
}
