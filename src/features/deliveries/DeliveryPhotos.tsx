// Photos and tickets on a delivery: each one downloads in one click; posters add more with the one uploader
// (Camera on phones, Upload everywhere). A photo lands on the delivery it was taken from, with no save step.
import { useAttachDeliveryFiles } from '../../data/deliveries.mutations';
import { messageOf } from '../../data/errors';
import { FileLine } from '../bids/FileLine';
import { UploadButtons } from '../files/UploadButtons';
import { useToast } from '../../ui/Toast';

interface DeliveryPhotosProps {
  projectId: string;
  deliveryId: string;
  fileIds: readonly string[];
  canAdd: boolean;
  isPhone: boolean;
}

export function DeliveryPhotos({ projectId, deliveryId, fileIds, canAdd, isPhone }: DeliveryPhotosProps) {
  const attach = useAttachDeliveryFiles(projectId);
  const toast = useToast();
  if (fileIds.length === 0 && !canAdd) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Photos and tickets">
      <h3 className="text-xs font-medium text-ink-2">Photos / tickets</h3>
      {fileIds.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {fileIds.map((id) => (
            <FileLine key={id} fileId={id} />
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
    </section>
  );
}
