// Photos and tickets on a delivery: one tile each (a photo shows its picture, a ticket its file icon and name); one click
// downloads the original. Posters add more with the one uploader (Camera on phones, Upload everywhere). A photo lands
// on the delivery it was taken from, with no save step.
import { LoaderCircle } from 'lucide-react';
import { useAttachDeliveryFiles } from '../../data/deliveries.mutations';
import { messageOf } from '../../data/errors';
import { useFile } from '../../data/queries';
import { isPhotoFile } from '../../lib/photos';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { PaneSection } from '../../ui/ReadingPane';
import { PHOTO_GRID, PHOTO_TILE, Thumb } from '../../ui/Thumb';
import { useToast } from '../../ui/Toast';
import { UploadButtons } from '../files/UploadButtons';
import { useDownload } from '../files/useDownload';

interface FileTileProps {
  fileId: string;
  downloading: boolean;
  onDownload: (fileId: string, size: number | undefined) => void;
}

function FileTile({ fileId, downloading, onDownload }: FileTileProps) {
  const file = useFile(fileId);
  const name = file.data?.original_name ?? (file.isPending ? 'Loading' : 'File');
  const photo = file.data ? isPhotoFile(file.data.original_name, file.data.mime) : false;
  return (
    <li>
      <button
        type="button"
        title={name}
        aria-label={`Download ${name}`}
        disabled={file.isPending}
        className={PHOTO_TILE}
        onClick={() => {
          onDownload(fileId, file.data?.size);
        }}
      >
        {photo ? (
          <Thumb fileId={fileId} alt={name} fill />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-card-head p-1.5 text-ink-2">
            {file.isPending ? null : <Icon icon={fileIcon(name, file.data?.mime)} size={22} />}
            <span className="w-full break-words text-center text-[11px] leading-4">{file.isPending ? '' : name}</span>
          </span>
        )}
        {downloading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-card/60">
            <Icon icon={LoaderCircle} size={20} className="animate-spin text-ink-2" label="Downloading" />
          </span>
        ) : null}
      </button>
    </li>
  );
}

interface DeliveryPhotosProps {
  projectId: string;
  deliveryId: string;
  fileIds: readonly string[];
  canAdd: boolean;
  isPhone: boolean;
}

export function DeliveryPhotos({ projectId, deliveryId, fileIds, canAdd, isPhone }: DeliveryPhotosProps) {
  const attach = useAttachDeliveryFiles(projectId);
  const download = useDownload();
  const toast = useToast();
  if (fileIds.length === 0 && !canAdd) return null;
  return (
    <PaneSection title="Photos / tickets">
      {fileIds.length > 0 ? (
        <ul className={PHOTO_GRID} aria-label="Photos / tickets">
          {fileIds.map((id) => (
            <FileTile key={id} fileId={id} downloading={download.pendingId === id} onDownload={download.start} />
          ))}
        </ul>
      ) : null}
      {canAdd ? (
        <div className="flex gap-2">
          <UploadButtons
            showCamera={isPhone}
            onFiles={(files) => {
              attach.mutate(
                { deliveryId, files },
                {
                  onSuccess: () => {
                    toast.show({ message: files.length === 1 ? 'Uploading 1 file.' : `Uploading ${String(files.length)} files.` });
                  },
                  onError: (e) => {
                    toast.show({ tone: 'error', message: `Not added: ${messageOf(e)}` });
                  },
                },
              );
            }}
          />
        </div>
      ) : null}
    </PaneSection>
  );
}
