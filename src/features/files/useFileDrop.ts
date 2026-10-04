// The Files list as a drop target: files (and whole folders) dragged in from the desktop go to the same place the
// Upload button sends them. `over` is true while such a drag is over the target, for the "Drop to upload" look.
import { useRef, useState, type DragEvent } from 'react';
import { messageOf } from '../../data/errors';
import { carriesFiles } from '../../lib/fileDrag';
import { useToast } from '../../ui/Toast';
import { collectDrop } from './collectDrop';

interface FileDrop {
  over: boolean;
  handlers: {
    onDragEnter: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
}

/** `enabled` is the same test the Upload button is shown by: may this person write to the folder? */
export function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void): FileDrop {
  const toast = useToast();
  // Enter and leave fire for every row the drag crosses: the drag has left only when the count is back to zero.
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => enabled && carriesFiles(e.dataTransfer);

  return {
    over,
    handlers: {
      onDragEnter: (e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      },
      onDragOver: (e) => {
        // Accepting is all: the browser keeps the effect the drag's source allows.
        if (accepts(e)) e.preventDefault();
      },
      onDragLeave: (e) => {
        if (!accepts(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      },
      onDrop: (e) => {
        depth.current = 0;
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        collectDrop(e.dataTransfer)
          .then((files) => {
            if (files.length > 0) onFiles(files);
          })
          .catch((err: unknown) => {
            toast.show({ tone: 'error', message: `Could not read what was dropped: ${messageOf(err)}` });
          });
      },
    },
  };
}
