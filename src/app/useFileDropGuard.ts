// A file dropped anywhere that is not a drop target does nothing. Without this the browser opens the file in place of
// the app, and every upload in progress is lost. Drop targets (Files, Bids received) handle their own drags first;
// this is what is left over, so it shows "not allowed" there.
import { useEffect } from 'react';
import { carriesFiles } from '../lib/fileDrag';

function refuse(e: DragEvent): void {
  if (e.defaultPrevented || !carriesFiles(e.dataTransfer)) return;
  // A file input takes a dropped file by itself.
  if (e.target instanceof HTMLInputElement && e.target.type === 'file') return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
}

export function useFileDropGuard(): void {
  useEffect(() => {
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
    };
  }, []);
}
