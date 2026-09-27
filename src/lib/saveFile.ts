// The ONE download path (CLAUDE.md rule 11). Every "Download" button ends here.
//   - A signed URL (string): the server already set Content-Disposition with the original filename, so a plain
//     anchor click downloads it in one step on every browser.
//   - Bytes (Blob): on a phone that can share files, the share sheet ("Save to Files" / "Save image"); everywhere
//     else an anchor download with the filename.
// The anchor is never attached to the page: its synthetic click stays off the document (the tap-budget tests
// count document clicks), and nothing is left behind.

const REVOKE_AFTER_MS = 60_000;

function clickAnchor(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
}

function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** True where the share sheet can take a file: phones with Web Share Level 2. */
export function canShareFiles(): boolean {
  if (!isCoarsePointer() || !('canShare' in navigator)) return false;
  return navigator.canShare({ files: [new File([], 'probe.bin')] });
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export async function saveFile(source: string | Blob, filename: string): Promise<void> {
  if (typeof source === 'string') {
    clickAnchor(source, filename);
    return;
  }
  if (canShareFiles()) {
    const file = new File([source], filename, { type: source.type || 'application/octet-stream' });
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      // The person closed the share sheet: that is their choice, not an error.
      if (isAbort(e)) return;
      // Share can refuse after an await (the tap's user activation expired). Fall through to a plain download,
      // and still report the refusal so it shows up in Sentry.
      console.warn('share sheet refused; falling back to download', e);
    }
  }
  const url = URL.createObjectURL(source);
  clickAnchor(url, filename);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_AFTER_MS);
}
