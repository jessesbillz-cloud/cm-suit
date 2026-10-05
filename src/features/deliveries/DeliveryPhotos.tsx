// Photos and tickets on a delivery: one tile each (a photo shows its picture, a ticket its file icon and name). A tap
// opens the file viewer over the delivery's files (a PDF ticket's pages, arrows between them, Download, and Remove for
// whoever may take one off); the corner arrow downloads the original in one click. Posters add more with the one
// uploader (Camera on phones, Upload everywhere). A photo lands on the delivery it was taken from, with no save step.
// Its poster (or deliveries.manage) takes one off with the X or the viewer's Delete, with Undo on the toast. A file
// deleted in Files is simply no longer shown.
import { Download, LoaderCircle, X } from 'lucide-react';
import { useAttachDeliveryFiles, useRemoveDeliveryFile, useRestoreDeliveryFile } from '../../data/deliveries.mutations';
import { messageOf } from '../../data/errors';
import { usePreviewFetch } from '../../data/preview';
import { useFile, useFilesById } from '../../data/queries';
import { isPhotoFile } from '../../lib/photos';
import { useFileViewer } from '../../ui/FileViewer';
import { fileIcon } from '../../ui/fileIcon';
import { Icon } from '../../ui/Icon';
import { PaneSection } from '../../ui/ReadingPane';
import { PHOTO_GRID, PHOTO_REMOVE, PHOTO_TILE, Thumb } from '../../ui/Thumb';
import { useToast } from '../../ui/Toast';
import { UploadButtons } from '../files/UploadButtons';
import { useDownload } from '../files/useDownload';
import { fileViewerItem } from '../files/viewerItems';

/** The round download arrow in a tile's bottom-right corner (the X sits top-right). */
const TILE_DOWNLOAD =
  'absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-card/95 text-ink-2 shadow-control hover:text-accent disabled:opacity-60';

interface FileTileProps {
  fileId: string;
  downloading: boolean;
  onView: (fileId: string) => void;
  onDownload: (fileId: string, size: number | undefined) => void;
  /** Present for the poster and deliveries.manage. */
  onRemove?: ((fileId: string, name: string) => void) | undefined;
}

function FileTile({ fileId, downloading, onView, onDownload, onRemove }: FileTileProps) {
  const file = useFile(fileId);
  // Deleted in Files (or no longer readable): the tile goes instead of failing on Download.
  if (file.data === null) return null;
  const name = file.data?.original_name ?? (file.isPending ? 'Loading' : 'File');
  const photo = file.data ? isPhotoFile(file.data.original_name, file.data.mime) : false;
  return (
    <li className="relative" data-testid="delivery-file">
      <button
        type="button"
        title={name}
        aria-label={`View ${name}`}
        disabled={file.isPending}
        className={PHOTO_TILE}
        data-testid="delivery-file-view"
        onClick={() => {
          onView(fileId);
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
      {file.data ? (
        <button
          type="button"
          aria-label={`Download ${name}`}
          title="Download"
          className={TILE_DOWNLOAD}
          data-testid="delivery-file-download"
          disabled={downloading}
          onClick={() => {
            onDownload(fileId, file.data?.size);
          }}
        >
          <Icon icon={Download} size={14} />
        </button>
      ) : null}
      {onRemove && file.data ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          title="Remove"
          className={PHOTO_REMOVE}
          data-testid="delivery-file-remove"
          onClick={() => {
            onRemove(fileId, name);
          }}
        >
          <Icon icon={X} size={14} />
        </button>
      ) : null}
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
  const remove = useRemoveDeliveryFile(projectId);
  const restore = useRestoreDeliveryFile(projectId);
  const download = useDownload();
  const toast = useToast();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const rows = useFilesById(fileIds);
  if (fileIds.length === 0 && !canAdd) return null;

  // mutateAsync: the Undo must still run (and report) if the pane has moved on by then.
  const doRemove = (fileId: string, name: string) => {
    void remove
      .mutateAsync({ deliveryId, fileId })
      .then(() => {
        toast.show({
          message: `Removed ${name}.`,
          action: {
            label: 'Undo',
            onClick: () => {
              void restore.mutateAsync({ deliveryId, fileId }).catch((e: unknown) => {
                toast.show({ tone: 'error', message: `Not put back: ${messageOf(e)}` });
              });
            },
          },
        });
      })
      .catch((e: unknown) => {
        toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
      });
  };
  // The viewer walks the delivery's files in tile order; Delete there is the same remove, with the same Undo.
  const items = rows.map((f) =>
    fileViewerItem(
      f,
      preview,
      canAdd
        ? () => {
            doRemove(f.id, f.original_name);
          }
        : undefined,
    ),
  );
  const view = (fileId: string) => {
    const at = items.findIndex((i) => i.id === fileId);
    if (at >= 0) viewer.open(items, at);
  };
  return (
    <PaneSection title="Photos / tickets">
      {fileIds.length > 0 ? (
        <ul className={PHOTO_GRID} aria-label="Photos / tickets">
          {fileIds.map((id) => (
            <FileTile
              key={id}
              fileId={id}
              downloading={download.pendingId === id}
              onView={view}
              onDownload={download.start}
              onRemove={canAdd ? doRemove : undefined}
            />
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
