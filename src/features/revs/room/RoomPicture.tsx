// A room's picture from its own page (0094, revs.manage): "Add picture" where there is none, Replace on the picture.
// The file goes to the job's Room pictures (the app's folder) and becomes the room's at once; Undo in the toast puts
// the old one back. One picture: JPG, PNG or WebP, as the room shows them. The hook lives in RoomImage, which stays on
// the page while the button swaps from Add to Replace, so the toast always comes.
import { useRef } from 'react';
import { ImagePlus, Replace } from 'lucide-react';
import { messageOf } from '../../../data/errors';
import { useAddRoomPicture, useSetRoomImage, type RevRoom } from '../../../data/revs.rooms';
import { Button } from '../../../ui/Button';
import { useToast } from '../../../ui/Toast';

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function useRoomPicture(projectId: string, room: RevRoom) {
  const add = useAddRoomPicture(projectId);
  const set = useSetRoomImage();
  const toast = useToast();
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  return {
    busy: add.isPending || set.isPending,
    add: (file: File) => {
      if (!ACCEPT.split(',').includes(file.type)) {
        toast.show({ tone: 'error', message: 'Pick a JPG, PNG or WebP picture.' });
        return;
      }
      const was = { fileId: room.image_file_id, imageName: room.image_name };
      add.mutate(
        { room, file },
        {
          onSuccess: (row) => {
            toast.show({
              message: was.fileId === null ? 'Picture added.' : 'Picture replaced.',
              action: { label: 'Undo', onClick: () => { void set.mutateAsync({ room: row, ...was }).catch(failed); } },
            });
          },
          onError: failed,
        },
      );
    },
  };
}

interface RoomPictureProps {
  /** The room has a picture: Replace on it, else Add picture. */
  replace: boolean;
  busy: boolean;
  onFile: (file: File) => void;
}

export function RoomPicture({ replace, busy, onFile }: RoomPictureProps) {
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current?.click();
  return (
    <>
      {replace ? (
        <Button
          size="sm"
          variant="quiet"
          icon={Replace}
          aria-label="Replace picture"
          title="Replace picture"
          className="!rounded-full"
          loading={busy}
          data-testid="room-picture-replace"
          onClick={pick}
        />
      ) : (
        <Button size="sm" icon={ImagePlus} loading={busy} data-testid="room-picture-add" onClick={pick}>
          Add picture
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="room-picture-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}
